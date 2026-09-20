import {supabase} from './client';
import {dataErrorMessage} from './errors';

// Mirrors supabase/functions/generate-insights/types.ts (InsightsResponse).
// Kept as a plain duplicate here rather than a shared import: the Edge
// Function runs on Deno and this file ships in the React Native bundle, so
// the two can't share a module graph. If you change the function's response
// shape, update this file to match.

export type InsightDirection = 'up' | 'down' | 'flat';

export type InsightPeriod = 'week' | 'month' | 'year';

/**
 * How a current-vs-previous comparison should be displayed:
 *
 *   previous  current  changeKind   display
 *   ₹500      ₹0       decrease     -100%
 *   ₹500      ₹250     decrease     -50%
 *   ₹500      ₹750     increase     +50%
 *   ₹0        ₹500     new          New / +₹500
 *   ₹0        ₹0       no-change    No change
 */
export type ChangeKind = 'increase' | 'decrease' | 'new' | 'no-change';

export type InsightHighlight = {
  category: string;
  text: string;
  direction: InsightDirection;
  amount: number;
};

export type PeriodComparisonStats = {
  currentTotal: number;
  previousTotal: number;
  changeAmount: number;
  changePercent: number | null;
  direction: InsightDirection;
  changeKind: ChangeKind;
};

export type CategoryChangeStats = {
  category: string;
  currentAmount: number;
  previousAmount: number;
  changeAmount: number;
  changePercent: number | null;
  direction: InsightDirection;
  changeKind: ChangeKind;
};

export type UnusualSpendingStats = {
  category: string;
  currentAmount: number;
  averageAmount: number;
  percentAboveAverage: number | null;
  isNewSpending: boolean;
};

export type RecurringPaymentItem = {
  merchant: string;
  category: string | null;
  amount: number;
  lastChargedOn: string;
};

export type RecurringPaymentsStats = {
  items: RecurringPaymentItem[];
  currentTotal: number;
  previousTotal: number;
  changePercent: number | null;
};

export type SavingsProgressStats = {
  goalSet: boolean;
  monthlySavingsGoal: number | null;
  savedSoFarThisMonth: number;
  percentOfGoal: number | null;
  projectedMonthEndSavings: number | null;
  onTrack: boolean | null;
};

export type PatternChangeStats = {
  scope: 'overall' | 'category';
  label: string;
  changePercent: number;
  direction: InsightDirection;
  amount: number;
};

export type TrendBucketStat = {
  date: string;
  amount: number;
  label: string;
};

export type CalculatedInsightStats = {
  referenceDate: string;
  period: InsightPeriod;
  /** False when the period is still in progress (e.g. "this month so far"). */
  isPeriodComplete: boolean;
  currency: string;
  periodComparison: PeriodComparisonStats;
  categoryChanges: CategoryChangeStats[];
  unusualSpending: UnusualSpendingStats[];
  recurringPayments: RecurringPaymentsStats;
  savingsProgress: SavingsProgressStats;
  patternChanges: PatternChangeStats[];
  trendBuckets: TrendBucketStat[];
};

export type InsightsResponse = {
  summary: string;
  highlights: InsightHighlight[];
  stats: CalculatedInsightStats;
  generatedAt: string;
  aiGenerated: boolean;
};

export type GenerateInsightsOptions = {
  /** Which comparison window to calculate. Defaults to "week". */
  period?: InsightPeriod;
  /** Override "today" for the calculation window, `YYYY-MM-DD`. Mainly for testing. */
  referenceDate?: string;
};

/**
 * Calls the `generate-insights` Edge Function. All statistics are computed
 * server-side from the signed-in user's own transactions (enforced by RLS);
 * the AI only writes the `summary` sentence.
 */
export async function generateInsights(options: GenerateInsightsOptions = {}): Promise<InsightsResponse> {
  const {data, error} = await supabase.functions.invoke<InsightsResponse>('generate-insights', {
    body: options,
  });

  if (error || !data) {
    throw new Error(dataErrorMessage(error));
  }

  return data;
}
