// OCR for Paisa's receipt scanner.
//
// Flow:
//   React Native picks/photographs a receipt, downsizes it to a JPEG
//     -> this function transcribes the printed text, line by line (OCR only)
//     -> the app parses merchant, date, total and items from those lines
//        (src/lib/receipts/parseReceipt.ts, pure TS, unit tested)
//     -> the user reviews and confirms before anything is saved
//
// Gemini (gemini-3.1-flash-lite by default, GEMINI_API_KEY secret) is used
// strictly as an OCR engine: it returns the text it sees and nothing else.
// It never totals, classifies or interprets anything, so every number the
// app shows was printed on the receipt or computed by the deterministic
// parser from printed numbers.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import {z} from 'npm:zod@3.23.8';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

// Measured on the same receipt: 3.1 Flash Lite usually answers in ~4s, 3.5
// Flash Lite in 25-40s. Both read it equally well, so the fast one goes first.
const DEFAULT_MODEL = 'gemini-3.1-flash-lite';
const FALLBACK_MODEL = 'gemini-3.5-flash-lite';
// Gemini's free tier is spiky (the odd 25-50s answer, or a 503 under high
// demand), so a slow attempt is not waited out: a second request starts
// alongside it after 8s, the fallback model after 16s, and the first answer
// wins. A failed attempt starts the next one straight away.
const HEDGE_DELAYS_MS = [8000, 16000];
const TOTAL_BUDGET_MS = 60000;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
// ~5 MB of JPEG once decoded; the app sends ~1600px images well under this.
const MAX_IMAGE_BASE64_CHARS = 7_000_000;
const MAX_LINES = 400;
const MAX_LINE_LENGTH = 200;

const SYSTEM_PROMPT = `You are an OCR engine. Transcribe the printed text of the receipt in the image.

Rules (do not break these):
- Output every printed line from top to bottom, one array entry per physical line on the receipt.
- Keep each line's text left to right exactly as printed, with two spaces between columns (e.g. "Amul Milk 500ml  2  30.00  60.00").
- Copy numbers, signs (-, CR, brackets), currency symbols, dates and times exactly. Never correct, round, total or compute anything.
- Do not translate, summarise, explain or add text that is not printed. Skip logos and barcodes you cannot read.
- If the image is not a receipt, bill, invoice or payslip, or has no readable text, return an empty array.
- Respond with ONLY a JSON object of the exact shape: {"lines": ["...", "..."]}. No other keys, no markdown, no code fences.`;

const requestBodySchema = z.object({
  image: z.string().min(100).max(MAX_IMAGE_BASE64_CHARS),
  mimeType: z.enum(['image/jpeg', 'image/png']).default('image/jpeg'),
});

const responseSchema = z.object({
  lines: z.array(z.string()),
});

// Gemini's structured output: it must answer with exactly {"lines": [...]}.
const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {lines: {type: 'ARRAY', items: {type: 'STRING'}}},
  required: ['lines'],
};

type GeminiPart = {text?: string; thought?: boolean};

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {...CORS_HEADERS, 'Content-Type': 'application/json'},
  });
}

/** Reads either the modern (JSON map) or legacy (plain string) anon key secret. */
function resolveAnonKey(): string | null {
  const legacy = Deno.env.get('SUPABASE_ANON_KEY');
  if (legacy) return legacy;

  const publishableKeys = Deno.env.get('SUPABASE_PUBLISHABLE_KEYS');
  if (publishableKeys) {
    try {
      const parsed = JSON.parse(publishableKeys) as Record<string, string>;
      return parsed.default ?? Object.values(parsed)[0] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

function cleanLines(lines: string[]): string[] {
  return lines
    .map(line => line.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, MAX_LINE_LENGTH))
    .filter(line => line.length > 0)
    .slice(0, MAX_LINES);
}

function callGemini(model: string, apiKey: string, image: string, mimeType: string, signal: AbortSignal): Promise<Response> {
  return fetch(`${GEMINI_API_URL}/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {parts: [{text: SYSTEM_PROMPT}]},
      contents: [
        {
          role: 'user',
          parts: [{text: 'Transcribe this receipt.'}, {inline_data: {mime_type: mimeType, data: image}}],
        },
      ],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 4000,
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
      },
    }),
    signal,
  });
}

type RaceResult = {ok: true; body: string} | {ok: false; status: number};

/**
 * Runs the attempts in `models` with staggered starts (HEDGE_DELAYS_MS) and
 * resolves with the first successful body; every other request is aborted.
 */
function firstAnswer(models: string[], apiKey: string, image: string, mimeType: string): Promise<RaceResult> {
  return new Promise(resolve => {
    const controllers: AbortController[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const startedAt = Date.now();
    let launched = 0;
    let failed = 0;
    let lastStatus = 0;
    let settled = false;

    const finish = (result: RaceResult) => {
      if (settled) return;
      settled = true;
      timers.forEach(clearTimeout);
      controllers.forEach(controller => controller.abort());
      resolve(result);
    };

    const onFailure = () => {
      failed += 1;
      if (launched < models.length) {
        launch();
      } else if (failed >= models.length) {
        finish({ok: false, status: lastStatus});
      }
    };

    const launch = () => {
      if (settled || launched >= models.length) return;
      const attempt = launched + 1;
      const model = models[launched];
      launched += 1;
      const controller = new AbortController();
      controllers.push(controller);
      callGemini(model, apiKey, image, mimeType, controller.signal)
        .then(async response => {
          const body = await response.text();
          if (settled) return;
          if (response.ok) {
            console.log(`scan-receipt: ${model} answered at ${Date.now() - startedAt}ms (attempt ${attempt})`);
            finish({ok: true, body});
            return;
          }
          lastStatus = response.status;
          console.warn(`scan-receipt: ${model} failed with ${response.status} at ${Date.now() - startedAt}ms (attempt ${attempt})`, body.slice(0, 300));
          // A bad request or a rejected key will not get better on retry.
          if (response.status === 400 || response.status === 401 || response.status === 403) {
            finish({ok: false, status: response.status});
            return;
          }
          onFailure();
        })
        .catch(error => {
          if (settled) return;
          lastStatus = lastStatus || 502;
          console.warn(`scan-receipt: ${model} request error at ${Date.now() - startedAt}ms (attempt ${attempt})`, String(error));
          onFailure();
        });
    };

    timers.push(setTimeout(() => finish({ok: false, status: 504}), TOTAL_BUDGET_MS));
    HEDGE_DELAYS_MS.forEach(delay => timers.push(setTimeout(launch, delay)));
    launch();
  });
}

async function transcribe(image: string, mimeType: string): Promise<{lines: string[]} | {error: string; status: number}> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    console.error('scan-receipt: GEMINI_API_KEY is not set');
    return {error: 'Receipt scanning is not set up on the server yet.', status: 503};
  }
  const model = Deno.env.get('OCR_MODEL') || DEFAULT_MODEL;
  const result = await firstAnswer([model, model, FALLBACK_MODEL], apiKey, image, mimeType);

  try {
    if (!result.ok) {
      console.error('scan-receipt: every Gemini attempt failed, last status', result.status);
      if (result.status === 429) {
        return {error: 'Too many receipts scanned just now. Wait a minute and try again.', status: 429};
      }
      if (result.status === 504) {
        return {error: 'Reading the receipt took too long. Try again.', status: 504};
      }
      return {error: 'Could not read the receipt. Try again.', status: 502};
    }

    const payload = JSON.parse(result.body);
    const parts: GeminiPart[] = payload?.candidates?.[0]?.content?.parts ?? [];
    // Thinking models can return their reasoning as separate "thought" parts.
    const content = parts
      .filter(part => !part.thought && typeof part.text === 'string')
      .map(part => part.text)
      .join('');
    if (!content) {
      console.error('scan-receipt: Gemini response missing content', payload?.candidates?.[0]?.finishReason ?? payload?.promptFeedback?.blockReason);
      return {error: 'Could not read the receipt. Try again.', status: 502};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(
        content
          .trim()
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, ''),
      );
    } catch {
      console.error('scan-receipt: OCR response was not valid JSON');
      return {error: 'Could not read the receipt. Try again.', status: 502};
    }

    const checked = responseSchema.safeParse(parsed);
    if (!checked.success) {
      console.error('scan-receipt: OCR response had the wrong shape');
      return {error: 'Could not read the receipt. Try again.', status: 502};
    }
    return {lines: cleanLines(checked.data.lines)};
  } catch (error) {
    console.error('scan-receipt: OCR failed', error);
    return {error: 'Could not read the receipt. Try again.', status: 502};
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {headers: CORS_HEADERS});
  }

  if (req.method !== 'POST') {
    return jsonResponse({error: 'Method not allowed. Use POST.'}, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const anonKey = resolveAnonKey();
  if (!supabaseUrl || !anonKey) {
    console.error('scan-receipt: missing SUPABASE_URL or anon/publishable key secret');
    return jsonResponse({error: 'Server misconfigured.'}, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({error: 'Missing Authorization header.'}, 401);
  }

  // Only signed-in users can spend OCR credits. Nothing is read or stored.
  const supabase = createClient(supabaseUrl, anonKey, {
    global: {headers: {Authorization: authHeader}},
    auth: {persistSession: false, autoRefreshToken: false},
  });
  const {
    data: {user},
    error: userError,
  } = await supabase.auth.getUser();
  if (userError || !user) {
    return jsonResponse({error: 'Invalid or expired session.'}, 401);
  }

  // Per-user hourly cap on OCR spend (consume_function_quota migration). If
  // the quota check itself fails, scanning stays available rather than broken.
  const {data: withinQuota, error: quotaError} = await supabase.rpc('consume_function_quota', {
    p_function: 'scan-receipt',
  });
  if (quotaError) {
    console.error('scan-receipt: quota check failed', quotaError);
  } else if (withinQuota === false) {
    return jsonResponse({error: 'Too many receipts scanned just now. Wait a while and try again.'}, 429);
  }

  let body: z.infer<typeof requestBodySchema>;
  try {
    const parsed = requestBodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({error: 'Send a JPEG or PNG image under 5 MB.'}, 400);
    }
    body = parsed.data;
  } catch {
    return jsonResponse({error: 'Send a JPEG or PNG image under 5 MB.'}, 400);
  }

  const result = await transcribe(body.image, body.mimeType);
  if ('error' in result) {
    return jsonResponse({error: result.error}, result.status);
  }
  return jsonResponse({lines: result.lines}, 200);
});
