// Shared types for the generate-insights Edge Function.
//
// Nothing here performs I/O or calls the AI — these are the plain data
// shapes that flow from Supabase -> deterministic calculations -> AI
// summary writer -> HTTP response -> React Native.

export type MoneyFlow = 'income' | 'expense';

export type Direction = 'up' | 'down' | 'flat';

export type PeriodKind = 'week' | 'month' | 'year';

/**
 * How a current-vs-previous comparison should be displayed. Percentages are
 * only meaningful when there was a non-zero previous amount to divide by:
 *
 *   previous  current  changeKind   display
 *   ₹500      ₹0       decrease     -100%
 *   ₹500      ₹250     decrease     -50%
 *   ₹500      ₹750     increase     +50%
 *   ₹0        ₹500     new          New / +₹500
 *   ₹0        ₹0       no-change    No change
 */
export type ChangeKind = 'increase' | 'decrease' | 'new' | 'no-change';

/** Minimal category info attached to a transaction. */
export interface CategoryRef {
  name: string;
  slug: string | null;
}

/** A transaction row, normalized from the Supabase query result. */
export interface TransactionRecord {
  id: string;
  type: MoneyFlow;
  amount: number;
  merchant: string | null;
  description: string | null;
  /** Calendar date, `YYYY-MM-DD`. */
  transactionDate: string;
  isRecurring: boolean;
  /** Ledger marker, e.g. `opening_balance` / `balance_adjustment`, or null. */
  notes: string | null;
  category: CategoryRef | null;
}

/** Subset of `profiles` needed for savings-goal math. */
export interface ProfileRecord {
  currency: string;
  monthlyIncome: number | null;
  monthlyBudget: number | null;
  monthlySavingsGoal: number | null;
  startingBalance: number | null;
}

// ---------------------------------------------------------------------------
// Calculated (deterministic) statistics
// ---------------------------------------------------------------------------

export interface PeriodComparisonStats {
  currentTotal: number;
  previousTotal: number;
  changeAmount: number;
  /** Percent change vs. the previous period. `null` when the previous period was ₹0. */
  changePercent: number | null;
  direction: Direction;
  changeKind: ChangeKind;
}

export interface CategoryChangeStats {
  category: string;
  currentAmount: number;
  previousAmount: number;
  changeAmount: number;
  changePercent: number | null;
  direction: Direction;
  changeKind: ChangeKind;
}

export interface UnusualSpendingStats {
  category: string;
  currentAmount: number;
  /** Trailing baseline average for this category (excludes the current period). */
  averageAmount: number;
  percentAboveAverage: number | null;
  isNewSpending: boolean;
}

export interface RecurringPaymentItem {
  merchant: string;
  category: string | null;
  amount: number;
  lastChargedOn: string;
}

export interface RecurringPaymentsStats {
  items: RecurringPaymentItem[];
  currentTotal: number;
  previousTotal: number;
  changePercent: number | null;
}

export interface SavingsProgressStats {
  goalSet: boolean;
  monthlySavingsGoal: number | null;
  savedSoFarThisMonth: number;
  percentOfGoal: number | null;
  projectedMonthEndSavings: number | null;
  onTrack: boolean | null;
}

export interface PatternChangeStats {
  scope: 'overall' | 'category';
  label: string;
  changePercent: number;
  direction: Direction;
  amount: number;
}

/** One chart bucket for the trend sparkline — a display aid, not an insight. */
export interface TrendBucketStat {
  /** Bucket start date, `YYYY-MM-DD`. */
  date: string;
  amount: number;
  /** Short axis label, e.g. "Mon" (week), "W1" (month), "Jan" (year). */
  label: string;
}

export interface CalculatedStats {
  referenceDate: string;
  period: PeriodKind;
  /** False when `referenceDate` is "today" — the period is still in progress, not finished. */
  isPeriodComplete: boolean;
  currency: string;
  periodComparison: PeriodComparisonStats;
  categoryChanges: CategoryChangeStats[];
  unusualSpending: UnusualSpendingStats[];
  recurringPayments: RecurringPaymentsStats;
  savingsProgress: SavingsProgressStats;
  patternChanges: PatternChangeStats[];
  trendBuckets: TrendBucketStat[];
}

// ---------------------------------------------------------------------------
// Response shape returned to React Native
// ---------------------------------------------------------------------------

export interface Highlight {
  category: string;
  text: string;
  direction: Direction;
  amount: number;
}

export interface InsightsResponse {
  summary: string;
  highlights: Highlight[];
  /** Full deterministic breakdown, for screens that want more than the headline. */
  stats: CalculatedStats;
  generatedAt: string;
  /** False when the AI call failed/was skipped and a rule-based summary was used. */
  aiGenerated: boolean;
}
