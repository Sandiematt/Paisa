import {MonthClose} from './budgetEngine';
import {supabase} from './supabase/client';
import {
  BudgetAdjustmentKind,
  BudgetMonthRow,
  MonthChoice,
} from './supabase/database.types';
import {dataErrorMessage} from './supabase/errors';
import {isMissingSchema} from './supabase/schema';

/**
 * Finished budget cycles and the money moved between budgets and savings
 * (supabase/migrations/20261030120000_budget_flow.sql). A cycle is written
 * once, on the first open after it ends; what is derived from it (limits,
 * what is left) is never stored.
 */
export type BudgetMonth = {
  cycleStart: string;
  cycleEnd: string;
  budget: number;
  savingsGoal: number;
  spendable: number;
  spent: number;
  extraSavings: number;
  overspentBy: number;
  partialFrom: string | null;
  /** The month-start review asks what to do with the extra. */
  prompt: boolean;
  /** Null until chosen; counts as keeping it as savings. */
  choice: MonthChoice | null;
  toBudget: number;
  appliedCycleStart: string | null;
  handledAt: string | null;
  reviewedAt: string | null;
  closedAt: string;
};

export type BudgetAdjustment = {
  id: string;
  cycleStart: string;
  kind: BudgetAdjustmentKind;
  amount: number;
  label: string | null;
  createdAt: string;
};

export type BudgetHistory = {
  /** False when the database does not have the tables yet. */
  available: boolean;
  months: BudgetMonth[];
  adjustments: BudgetAdjustment[];
};

export const EMPTY_HISTORY: BudgetHistory = {available: false, months: [], adjustments: []};

function money(value: number | string | null | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function day(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

export function monthFromRow(row: BudgetMonthRow): BudgetMonth {
  return {
    cycleStart: row.cycle_start.slice(0, 10),
    cycleEnd: row.cycle_end.slice(0, 10),
    budget: money(row.budget),
    savingsGoal: money(row.savings_goal),
    spendable: money(row.spendable),
    spent: money(row.spent),
    extraSavings: money(row.extra_savings),
    overspentBy: money(row.overspent_by),
    partialFrom: day(row.partial_from),
    prompt: row.prompt !== false,
    choice: row.choice ?? null,
    toBudget: money(row.to_budget),
    appliedCycleStart: day(row.applied_cycle_start),
    handledAt: row.handled_at,
    reviewedAt: row.reviewed_at,
    closedAt: row.closed_at,
  };
}

export async function loadBudgetHistory(): Promise<BudgetHistory> {
  const [months, adjustments] = await Promise.all([
    supabase.from('budget_months').select('*').order('cycle_start', {ascending: true}),
    supabase
      .from('budget_adjustments')
      .select('id, cycle_start, kind, amount, label, created_at')
      .order('created_at', {ascending: true}),
  ]);
  if (isMissingSchema(months.error) || isMissingSchema(adjustments.error)) {
    return EMPTY_HISTORY;
  }
  const error = months.error ?? adjustments.error;
  if (error) {
    throw new Error(dataErrorMessage(error));
  }
  return {
    available: true,
    months: (months.data ?? []).map(row => monthFromRow(row as BudgetMonthRow)),
    adjustments: (adjustments.data ?? []).map(row => ({
      id: row.id,
      cycleStart: String(row.cycle_start).slice(0, 10),
      kind: row.kind,
      amount: money(row.amount),
      label: row.label,
      createdAt: row.created_at,
    })),
  };
}

export type MonthCloseRecord = MonthClose & {
  budget: number;
  savingsGoal: number;
  prompt: boolean;
  /** Set when the cycle closes without a review (a long absence): kept as savings. */
  handled?: boolean;
};

/**
 * Writes a finished cycle. Idempotent: a cycle already written (by this
 * device or another) is left as it is.
 */
export async function closeBudgetMonth(record: MonthCloseRecord): Promise<void> {
  const now = new Date().toISOString();
  const {error} = await supabase.from('budget_months').upsert(
    {
      cycle_start: record.cycle.start,
      cycle_end: record.cycle.end,
      budget: record.budget,
      savings_goal: record.savingsGoal,
      spendable: record.spendable,
      spent: record.spent,
      extra_savings: record.extraSavings,
      overspent_by: record.overspentBy,
      partial_from: record.partialFrom,
      prompt: record.prompt,
      ...(record.handled
        ? {choice: 'keep' as const, handled_at: now, reviewed_at: now}
        : {}),
    },
    {onConflict: 'user_id,cycle_start', ignoreDuplicates: true},
  );
  if (error && !isMissingSchema(error)) {
    throw new Error(dataErrorMessage(error));
  }
}

/** Marks the review as shown, the moment it shows: it is never shown twice. */
export async function markMonthReviewed(cycleStart: string): Promise<void> {
  const {error} = await supabase
    .from('budget_months')
    .update({reviewed_at: new Date().toISOString()})
    .eq('cycle_start', cycleStart)
    .is('reviewed_at', null);
  if (error && !isMissingSchema(error)) {
    throw new Error(dataErrorMessage(error));
  }
}

/**
 * Keeps last month's extra as savings, or adds all of it to the budget of
 * `appliedCycleStart`. Recorded once; a second choice is ignored.
 */
export async function chooseMonthExtra(
  cycleStart: string,
  choice: MonthChoice,
  extraSavings: number,
  appliedCycleStart: string,
): Promise<BudgetMonth | null> {
  const {data, error} = await supabase.rpc('apply_month_choice', {
    p_cycle_start: cycleStart,
    p_choice: choice,
    p_extra_savings: extraSavings,
    p_applied_cycle_start: appliedCycleStart,
  });
  if (error) {
    throw new Error(dataErrorMessage(error));
  }
  const row = Array.isArray(data) ? data[0] : null;
  return row ? monthFromRow(row as BudgetMonthRow) : null;
}

/** Adds money to a cycle's budget, or moves some back to savings. */
export async function addBudgetAdjustment(
  cycleStart: string,
  kind: BudgetAdjustmentKind,
  amount: number,
  label?: string,
): Promise<void> {
  const {error} = await supabase.rpc('add_budget_adjustment', {
    p_cycle_start: cycleStart,
    p_kind: kind,
    p_amount: Math.round(amount * 100) / 100,
    p_label: label ?? null,
  });
  if (error) {
    throw new Error(
      /more than your extra savings/i.test(error.message ?? '')
        ? 'That is more than your extra savings.'
        : dataErrorMessage(error),
    );
  }
}
