// Paisa Insights backend.
//
// Flow (see README section in supabase/functions/generate-insights/):
//   Supabase transactions
//     -> calculate statistics in backend           (calculations.ts, pure TS)
//     -> AI writes a friendly one-line summary      (ai.ts, numbers-only context)
//     -> return structured JSON                     (this file)
//     -> React Native displays it
//
// The AI is NEVER shown raw transactions and NEVER performs calculations —
// it only turns already-verified numbers into a short sentence. See ai.ts
// for the numeric safety guard that enforces this at runtime.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import {createClient} from 'npm:@supabase/supabase-js@2.45.4';
import {z} from 'npm:zod@3.23.8';

import type {Database} from '../../../src/lib/supabase/database.types.ts';
import {generateSummary} from './ai.ts';
import {calculateInsightStats, earliestDateNeeded, todayISO} from './calculations.ts';
import type {CategoryRef, InsightsResponse, PeriodKind, ProfileRecord, TransactionRecord} from './types.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const;

const requestBodySchema = z
  .object({
    /** Optional override for "today", `YYYY-MM-DD`. Defaults to the server's current UTC date. */
    referenceDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'referenceDate must be YYYY-MM-DD')
      .optional(),
    /** Which comparison window to calculate. Defaults to "week". */
    period: z.enum(['week', 'month', 'year']).optional(),
  })
  .partial();

type RequestBody = {referenceDate: string; period: PeriodKind};

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

type TransactionQueryRow = {
  id: string;
  type: 'income' | 'expense';
  amount: number | string;
  merchant: string | null;
  description: string | null;
  transaction_date: string;
  notes: string | null;
  is_recurring: boolean | null;
  categories: {name: string; slug: string | null} | {name: string; slug: string | null}[] | null;
};

function normalizeCategory(raw: TransactionQueryRow['categories']): CategoryRef | null {
  if (!raw) return null;
  const category = Array.isArray(raw) ? raw[0] : raw;
  return category ? {name: category.name, slug: category.slug} : null;
}

function mapTransactionRow(row: TransactionQueryRow): TransactionRecord {
  const amount = typeof row.amount === 'number' ? row.amount : Number(row.amount);
  return {
    id: row.id,
    type: row.type,
    amount: Number.isFinite(amount) ? amount : 0,
    merchant: row.merchant,
    description: row.description,
    transactionDate: row.transaction_date.slice(0, 10),
    isRecurring: Boolean(row.is_recurring),
    notes: row.notes,
    category: normalizeCategory(row.categories),
  };
}

type ProfileQueryRow = {
  currency: string;
  monthly_income: number | string | null;
  monthly_budget: number | string | null;
  monthly_savings_goal: number | string | null;
  starting_balance: number | string | null;
};

function toNumberOrNull(value: number | string | null): number | null {
  if (value === null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapProfileRow(row: ProfileQueryRow): ProfileRecord {
  return {
    currency: row.currency,
    monthlyIncome: toNumberOrNull(row.monthly_income),
    monthlyBudget: toNumberOrNull(row.monthly_budget),
    monthlySavingsGoal: toNumberOrNull(row.monthly_savings_goal),
    startingBalance: toNumberOrNull(row.starting_balance),
  };
}

async function readRequestBody(req: Request): Promise<RequestBody> {
  const defaults: RequestBody = {referenceDate: todayISO(), period: 'week'};
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return defaults;
  }
  try {
    const raw = await req.text();
    if (!raw.trim()) return defaults;
    const parsed = requestBodySchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return {
        referenceDate: parsed.data.referenceDate ?? defaults.referenceDate,
        period: parsed.data.period ?? defaults.period,
      };
    }
  } catch {
    // Malformed body — fall through to defaults. This endpoint should never
    // hard-fail just because the client sent an empty or bad payload.
  }
  return defaults;
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
    console.error('generate-insights: missing SUPABASE_URL or anon/publishable key secret');
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

  const {referenceDate, period} = await readRequestBody(req);
  const fetchFrom = earliestDateNeeded(period, referenceDate);

  const [{data: profileRow, error: profileError}, {data: transactionRows, error: transactionsError}] = await Promise.all([
    supabase
      .from('profiles')
      .select('currency, monthly_income, monthly_budget, monthly_savings_goal, starting_balance')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('transactions')
      .select(
        'id, type, amount, merchant, description, transaction_date, notes, is_recurring, categories(name, slug)',
      )
      .eq('user_id', user.id)
      .gte('transaction_date', fetchFrom)
      .lte('transaction_date', referenceDate)
      .order('transaction_date', {ascending: true}),
  ]);

  if (profileError) {
    console.error('generate-insights: failed to load profile', profileError);
  }
  if (transactionsError) {
    console.error('generate-insights: failed to load transactions', transactionsError);
    return jsonResponse({error: 'Failed to load transaction data.'}, 500);
  }

  const transactions = ((transactionRows ?? []) as TransactionQueryRow[]).map(mapTransactionRow);
  const profile = profileRow ? mapProfileRow(profileRow as ProfileQueryRow) : null;

  const {stats, highlights} = calculateInsightStats(transactions, profile, referenceDate, period);
  const {summary, aiGenerated} = await generateSummary(stats);

  const response: InsightsResponse = {
    summary,
    highlights,
    stats,
    generatedAt: new Date().toISOString(),
    aiGenerated,
  };

  return jsonResponse(response, 200);
});
