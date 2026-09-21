// Deterministic, pure statistics calculations for Paisa AI chat.
//
// CRITICAL: this module never talks to Gemini. Every number the reply AI or
// the expense parser is ever handed comes from here (or from the user's own
// message), computed in plain TypeScript straight from Supabase — mirrors
// the split in supabase/functions/generate-insights/calculations.ts.

import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.45.4';

import type {Database} from '../../../src/lib/supabase/database.types.ts';
import type {CategoryRef, CategorySpend, ChatFinancialContext, MoneyFlow, ProfileRecord, TransactionRecord} from './types.ts';

// Ledger markers written by the app for opening balance / manual balance
// adjustments (see src/lib/transactionsStore.ts). These aren't organic
// spending, so they're excluded from every calculation below.
const OPENING_BALANCE_NOTE = 'opening_balance';
const BALANCE_ADJUSTMENT_NOTE = 'balance_adjustment';

const BASELINE_MONTHS = 3;
const RECENT_EXPENSE_LIMIT = 8;

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function daysInMonthUTC(year: number, month1based: number): number {
  return new Date(Date.UTC(year, month1based, 0)).getUTCDate();
}

function addMonthsISO(iso: string, months: number): string {
  const [year, month] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1 + months, 1)).toISOString().slice(0, 10);
}

function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isLedgerEntry(row: {notes: string | null}): boolean {
  return row.notes === OPENING_BALANCE_NOTE || row.notes === BALANCE_ADJUSTMENT_NOTE;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

type ProfileQueryRow = {
  currency: string;
  monthly_income: number | string | null;
  monthly_budget: number | string | null;
  monthly_savings_goal: number | string | null;
  starting_balance: number | string | null;
};

type CategoryQueryRow = {
  id: string;
  name: string;
  slug: string | null;
  type: MoneyFlow;
};

type TransactionQueryRow = {
  id: string;
  type: MoneyFlow;
  amount: number | string;
  category_id: string | null;
  merchant: string | null;
  description: string | null;
  transaction_date: string;
  payment_method: string | null;
  notes: string | null;
};

function toNumberOrNull(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNumber(value: number | string | null): number {
  return toNumberOrNull(value) ?? 0;
}

/**
 * Loads the signed-in user's profile, categories, and the trailing window of
 * transactions needed to compute this month's spend plus a baseline average
 * per category, then reduces all of it to the deterministic snapshot the AI
 * is allowed to see. Throws only on a genuine Supabase query failure — the
 * caller (index.ts) turns that into a 500.
 */
export async function buildChatContext(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<ChatFinancialContext> {
  const today = todayISO();
  const monthStart = monthStartOf(today);
  const baselineStart = addMonthsISO(monthStart, -BASELINE_MONTHS);
  const baselineEnd = addDaysISO(monthStart, -1);

  const [profileResult, categoriesResult, transactionsResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('currency, monthly_income, monthly_budget, monthly_savings_goal, starting_balance')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('categories').select('id, name, slug, type'),
    supabase
      .from('transactions')
      .select('id, type, amount, category_id, merchant, description, transaction_date, payment_method, notes')
      .eq('user_id', userId)
      .gte('transaction_date', baselineStart)
      .lte('transaction_date', today)
      .order('transaction_date', {ascending: false}),
  ]);

  if (categoriesResult.error) {
    throw new Error(`Failed to load categories: ${categoriesResult.error.message}`);
  }
  if (transactionsResult.error) {
    throw new Error(`Failed to load transactions: ${transactionsResult.error.message}`);
  }

  const profileRow = profileResult.data as ProfileQueryRow | null;
  const profile: ProfileRecord = {
    currency: profileRow?.currency ?? 'INR',
    monthlyIncome: toNumberOrNull(profileRow?.monthly_income),
    monthlyBudget: toNumberOrNull(profileRow?.monthly_budget),
    monthlySavingsGoal: toNumberOrNull(profileRow?.monthly_savings_goal),
    startingBalance: toNumberOrNull(profileRow?.starting_balance),
  };

  const categories: CategoryRef[] = ((categoriesResult.data ?? []) as CategoryQueryRow[]).map(row => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    type: row.type,
  }));
  const categoryById = new Map(categories.map(category => [category.id, category]));

  const transactions: TransactionRecord[] = ((transactionsResult.data ?? []) as TransactionQueryRow[]).map(row => ({
    id: row.id,
    type: row.type,
    amount: toNumber(row.amount),
    merchant: row.merchant,
    description: row.description,
    transactionDate: row.transaction_date.slice(0, 10),
    paymentMethod: row.payment_method,
    notes: row.notes,
    categoryId: row.category_id,
  }));

  const monthRows = transactions.filter(
    row => row.type === 'expense' && !isLedgerEntry(row) && row.transactionDate >= monthStart && row.transactionDate <= today,
  );
  const spentThisMonth = roundMoney(monthRows.reduce((sum, row) => sum + row.amount, 0));

  const monthlyBudget = Math.max(0, profile.monthlyBudget ?? 0);
  const [year, month, day] = today.split('-').map(Number);
  const daysInMonth = daysInMonthUTC(year, month);
  const daysElapsed = day;
  const daysLeft = Math.max(0, daysInMonth - daysElapsed + 1);
  const remaining = roundMoney(monthlyBudget - spentThisMonth);
  const dailySafe = daysLeft > 0 ? roundMoney(Math.max(0, remaining) / daysLeft) : Math.max(0, remaining);

  let pace: ChatFinancialContext['pace'] = null;
  if (monthlyBudget > 0) {
    const paceBudget = monthlyBudget * (daysElapsed / daysInMonth);
    if (paceBudget > 0.005) {
      const diffPct = Math.round(((paceBudget - spentThisMonth) / paceBudget) * 100);
      pace = {under: diffPct >= 0, pct: Math.abs(diffPct)};
    }
  }

  // Per-category spend this month vs. the trailing BASELINE_MONTHS full
  // months immediately before this one (used for anomaly detection).
  const categorySpendMap = new Map<string, {amountThisMonth: number; baselineTotal: number}>();
  for (const row of transactions) {
    if (row.type !== 'expense' || isLedgerEntry(row)) continue;
    const key = row.categoryId ?? 'uncategorized';
    const entry = categorySpendMap.get(key) ?? {amountThisMonth: 0, baselineTotal: 0};
    if (row.transactionDate >= monthStart && row.transactionDate <= today) {
      entry.amountThisMonth += row.amount;
    } else if (row.transactionDate >= baselineStart && row.transactionDate <= baselineEnd) {
      entry.baselineTotal += row.amount;
    }
    categorySpendMap.set(key, entry);
  }

  const categorySpend: CategorySpend[] = [...categorySpendMap.entries()].map(([key, value]) => {
    const category = key === 'uncategorized' ? null : categoryById.get(key) ?? null;
    return {
      categoryId: category?.id ?? null,
      name: category?.name ?? 'Uncategorized',
      slug: category?.slug ?? null,
      amountThisMonth: roundMoney(value.amountThisMonth),
      baselineAverage: roundMoney(value.baselineTotal / BASELINE_MONTHS),
    };
  });

  const rankedThisMonth = [...categorySpend].sort((a, b) => b.amountThisMonth - a.amountThisMonth);
  const topCategory =
    rankedThisMonth.length > 0 && rankedThisMonth[0].amountThisMonth > 0
      ? {name: rankedThisMonth[0].name, amount: rankedThisMonth[0].amountThisMonth}
      : null;

  const recentExpenses = transactions
    .filter(row => row.type === 'expense' && !isLedgerEntry(row))
    .slice(0, RECENT_EXPENSE_LIMIT)
    .map(row => ({
      merchant: row.merchant,
      description: row.description,
      amount: row.amount,
      date: row.transactionDate,
      categoryName: row.categoryId ? categoryById.get(row.categoryId)?.name ?? null : null,
    }));

  return {
    today,
    currency: profile.currency,
    monthStart,
    daysInMonth,
    daysElapsed,
    daysLeft,
    monthlyBudget,
    spentThisMonth,
    remaining,
    dailySafe,
    pace,
    categories,
    categorySpend,
    topCategory,
    recentExpenses,
  };
}
