// Thin wrapper around the Gemini REST API for the paisaai-chat Edge
// Function. Mirrors supabase/functions/generate-insights/ai.ts: every call
// times out, degrades to `null` on any failure, and never throws — callers
// are expected to fall back to deterministic behavior.

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 20;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

export type GeminiCallOptions = {
  systemPrompt: string;
  userContent: string;
  temperature?: number;
  maxOutputTokens?: number;
};

function resolveTimeoutMs(): number {
  const raw = Deno.env.get('AI_RESPONSE_TIMEOUT_MS');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

/**
 * Calls Gemini with `responseMimeType: application/json` and returns the
 * parsed JSON value, or `null` if the API key is missing, the request
 * fails, times out, or the response isn't valid JSON. Never throws — every
 * caller in this function is expected to have a deterministic fallback.
 */
export async function callGeminiJSON({
  systemPrompt,
  userContent,
  temperature = 0.4,
  maxOutputTokens = 300,
}: GeminiCallOptions): Promise<unknown | null> {
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return null;
  }

  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), resolveTimeoutMs());

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: systemPrompt}]},
        contents: [{role: 'user', parts: [{text: userContent}]}],
        generationConfig: {
          temperature,
          maxOutputTokens,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('paisaai-chat: Gemini request failed', response.status, await response.text());
      return null;
    }

    const payload = await response.json();
    const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== 'string') {
      console.error('paisaai-chat: Gemini response missing content', JSON.stringify(payload).slice(0, 500));
      return null;
    }

    try {
      return JSON.parse(content);
    } catch {
      console.error('paisaai-chat: Gemini response was not valid JSON');
      return null;
    }
  } catch (error) {
    console.error('paisaai-chat: Gemini call failed', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Best-effort per-user rate limiting.
//
// Edge Function isolates are ephemeral: this in-memory map only survives
// across "warm" invocations of the same isolate and resets on cold start or
// redeploy. That's an acceptable trade-off here — the goal is smoothing out
// accidental rapid-fire requests from a single user/device, not providing a
// hard security guarantee. For a hard guarantee, back this with a Postgres
// table instead (one row per request, checked/pruned per call).
// ---------------------------------------------------------------------------

const rateLimitWindows = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 60_000;

function resolveRateLimitPerMinute(): number {
  const raw = Deno.env.get('AI_RATE_LIMIT_PER_MINUTE');
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RATE_LIMIT_PER_MINUTE;
}

/**
 * Returns `true` if `userId` is currently within the per-minute rate limit
 * (and records this call towards it); `false` if the caller should be
 * rejected with a 429.
 */
export function checkRateLimit(userId: string): boolean {
  const limit = resolveRateLimitPerMinute();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const timestamps = (rateLimitWindows.get(userId) ?? []).filter(ts => ts > windowStart);

  if (timestamps.length >= limit) {
    rateLimitWindows.set(userId, timestamps);
    return false;
  }

  timestamps.push(now);
  rateLimitWindows.set(userId, timestamps);
  return true;
}
