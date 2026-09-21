// Paisa AI chat backend.
//
// Flow:
//   Supabase profile/categories/transactions
//     -> deterministic financial snapshot           (context-builder.ts)
//     -> deterministic anomaly + forecast math       (pattern-detector.ts)
//     -> Gemini extracts a structured expense        (expense-parser.ts, numeric-safety guarded)
//     -> Gemini writes a short conversational reply   (this file, numeric-safety guarded)
//     -> return structured JSON                       (this file)
//     -> React Native displays it
//
// The reply-writing AI is NEVER shown raw transactions and NEVER performs
// calculations — it only turns already-verified numbers into a short
// sentence, and every number it mentions is checked against the numbers we
// handed it before being trusted (see isReplyNumericallySafe below). If
// Gemini is unavailable, misbehaves, or any step fails, we fall back to a
// deterministic, template-based reply so the endpoint always returns
// something useful — see fallback-reply.ts.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';

import type {Database} from '../../../src/lib/supabase/database.types.ts';
import {buildChatContext} from './context-builder.ts';
import {parseExpense} from './expense-parser.ts';
import {buildFallbackReply} from './fallback-reply.ts';
import {callGeminiJSON, checkRateLimit} from './gemini-client.ts';
import {detectAnomaly, detectForecast} from './pattern-detector.ts';
import {chatRequestBodySchema, geminiReplySchema} from './response-schema.ts';
import type {ChatAnomaly, ChatFinancialContext, ChatForecast, ChatResponse, ParsedExpense} from './types.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

const REPLY_SYSTEM_PROMPT = `You are Paisa AI, a calm, encouraging personal finance assistant inside a personal expense tracker app.

Understand the user's question and answer ONLY what they asked. Do not pad the answer with an unrelated spending insight, and do not repeat the same insight for unrelated questions.

You will receive JSON with:
- "message": what the user just typed.
- "tone": "short" (reply in exactly one sentence) or "detailed" (reply in at most two short sentences).
- "context": already-verified numbers for this month — budget, spent, remaining, daily safe spend, days left, top category, per-category spend.
- "parsedExpense": set if the user just logged an expense — the extracted amount/category/merchant.
- "anomaly": set if a category is unusually high this month vs. the user's normal average.
- "forecast": set if the user is projected to go over budget this month.

How to answer, in this order:
1. If "parsedExpense" is set, your first sentence must acknowledge the specific amount and merchant/category found — e.g. "Got it! ₹500 for Starbucks under Dining." Only add more if the message also asked something else.
2. Else, if the question is about the user's own spending, budget, savings, transactions, or financial data, answer it using ONLY "context" (and "anomaly"/"forecast" only if directly relevant to what was asked). If the numbers needed to answer aren't present in "context", say plainly that you don't have enough data for that yet — never invent or calculate a number to fill the gap.
3. Else, if it's a basic personal-finance question that doesn't depend on the user's own data (e.g. "What is a budget?", "What's an emergency fund?"), answer it directly in simple, beginner-friendly language. You do not need any numbers from "context" for these, and a short illustrative example is fine.
4. Never mention "anomaly" or "forecast" unless they are directly relevant to what the user asked.

Rules (do not break these):
- Do NOT perform any math on the user's real finances. Never invent, estimate, or alter a number, percentage, date, or category name that is supposed to be the user's own.
- When answering with the user's own numbers (case 2 above), only use numbers and category names that appear verbatim in the JSON you are given, and set "grounded": true.
- When answering a generic question with no reference to the user's own data (case 3 above), you may use illustrative example numbers, and set "grounded": false.
- Keep it warm, plain-English, no jargon, no emoji, no "Elevate/Seamless/Unleash/Revolutionize/Next-Gen".
- "short" tone: exactly one sentence. "detailed" tone: at most two short sentences.
- Optionally include up to 2 short "suggestions" — quick follow-up questions the user might ask next (max 6 words each).
- Respond with ONLY a JSON object of the exact shape: {"text": "...", "suggestions": ["...", ...], "grounded": true | false}. No other keys, no markdown, no code fences.`;

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

/** Trimmed, numbers-only context handed to the reply-writing AI. */
function buildReplyContext(context: ChatFinancialContext) {
  return {
    monthlyBudget: Math.round(context.monthlyBudget),
    spentThisMonth: Math.round(context.spentThisMonth),
    remaining: Math.round(context.remaining),
    dailySafe: Math.round(context.dailySafe),
    daysLeft: context.daysLeft,
    pace: context.pace,
    topCategory: context.topCategory
      ? {name: context.topCategory.name, amount: Math.round(context.topCategory.amount)}
      : null,
    categorySpend: context.categorySpend
      .filter(entry => entry.amountThisMonth > 0)
      .slice(0, 6)
      .map(entry => ({name: entry.name, amountThisMonth: Math.round(entry.amountThisMonth)})),
  };
}

function replyParsedExpenseContext(parsedExpense: ParsedExpense | null) {
  if (!parsedExpense) return null;
  return {
    amount: Math.round(parsedExpense.amount),
    category: parsedExpense.category,
    merchant: parsedExpense.merchant,
  };
}

/** Recursively collects every finite numeric leaf value from an object/array. */
function collectNumbers(value: unknown, acc: Set<number>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    acc.add(Math.round(Math.abs(value)));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectNumbers(item, acc));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectNumbers(item, acc));
  }
}

/**
 * Guards against AI hallucination: every number mentioned in the AI's
 * reply must correspond (within rounding tolerance) to a number we
 * actually computed and handed to it. If anything doesn't match, the reply
 * is rejected and the caller falls back to the deterministic one.
 */
function isReplyNumericallySafe(text: string, allowedContext: unknown): boolean {
  const allowed = new Set<number>();
  collectNumbers(allowedContext, allowed);

  const found = text.match(/\d+(\.\d+)?/g) ?? [];
  for (const raw of found) {
    const value = Math.round(parseFloat(raw));
    if (value === 0) continue;
    const isAllowed = [...allowed].some(candidate => Math.abs(candidate - value) <= 1);
    if (!isAllowed) return false;
  }
  return true;
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
    console.error('paisaai-chat: missing SUPABASE_URL or anon/publishable key secret');
    return jsonResponse({error: 'Server misconfigured.'}, 500);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({error: 'Missing Authorization header.'}, 401);
  }

  // Scoped to the calling user's JWT: Row Level Security ensures every query
  // below only ever sees that user's own transactions and profile — we never
  // need (and never use) the service role / secret key here.
  const supabase = createClient<Database>(supabaseUrl, anonKey, {
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

  if (!checkRateLimit(user.id)) {
    return jsonResponse({error: 'Too many messages. Wait a moment and try again.'}, 429);
  }

  let bodyJson: unknown;
  try {
    bodyJson = await req.json();
  } catch {
    return jsonResponse({error: 'Invalid JSON body.'}, 400);
  }

  const parsedBody = chatRequestBodySchema.safeParse(bodyJson);
  if (!parsedBody.success) {
    return jsonResponse({error: 'Invalid request.', details: parsedBody.error.flatten()}, 400);
  }
  const {message, tone = 'short'} = parsedBody.data;

  let context: ChatFinancialContext;
  try {
    context = await buildChatContext(supabase, user.id);
  } catch (error) {
    console.error('paisaai-chat: failed to build financial context', error);
    return jsonResponse({error: 'Failed to load your financial data.'}, 500);
  }

  const parsedExpense = await parseExpense(message, context.categories, context.today);
  const anomaly: ChatAnomaly | null = detectAnomaly(context.categorySpend);
  const forecast: ChatForecast | null = detectForecast(
    context.spentThisMonth,
    context.monthlyBudget,
    context.daysElapsed,
    context.daysInMonth,
  );

  const replyContext = buildReplyContext(context);
  const replyParsedExpense = replyParsedExpenseContext(parsedExpense);
  const geminiInput = {
    message,
    tone,
    context: replyContext,
    parsedExpense: replyParsedExpense,
    anomaly,
    forecast,
  };

  let text = buildFallbackReply(message, context, parsedExpense, anomaly, forecast);
  let suggestions: string[] | undefined;
  let aiGenerated = false;

  const raw = await callGeminiJSON({
    systemPrompt: REPLY_SYSTEM_PROMPT,
    userContent: JSON.stringify(geminiInput),
    temperature: tone === 'detailed' ? 0.5 : 0.4,
    maxOutputTokens: 260,
  });

  const parsedReply = raw ? geminiReplySchema.safeParse(raw) : null;
  if (parsedReply?.success) {
    const candidateText = parsedReply.data.text.trim();
    // Missing/omitted `grounded` defaults to `true` (checked) — the safer
    // assumption. Only a reply the model explicitly marks as a generic,
    // non-data answer skips the numeric-safety check, since it may
    // legitimately contain illustrative example numbers unrelated to the
    // user's real finances (e.g. "What is a budget?").
    const isGrounded = parsedReply.data.grounded !== false;
    const numericAllowance = {context: replyContext, parsedExpense: replyParsedExpense, anomaly, forecast};
    const isSafe = !isGrounded || isReplyNumericallySafe(candidateText, numericAllowance);

    if (candidateText && isSafe) {
      text = candidateText;
      suggestions = parsedReply.data.suggestions;
      aiGenerated = true;
    } else {
      console.warn('paisaai-chat: discarded AI reply with unverified numbers');
    }
  }

  const response: ChatResponse = {
    text,
    ...(parsedExpense ? {parsedExpense} : {}),
    ...(anomaly ? {anomaly} : {}),
    ...(forecast ? {forecast} : {}),
    ...(suggestions?.length ? {suggestions} : {}),
    aiGenerated,
  };

  return jsonResponse(response, 200);
});
