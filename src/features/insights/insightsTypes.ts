import type {InsightPeriod} from '../../lib/supabase/insights';

export type InsightsPeriod = InsightPeriod;

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

/** One chart bucket of the current window: a day (week), 7-day chunk (month) or month (year). */
export type SpendBucket = {
  /** Bucket start date, `YYYY-MM-DD`. */
  date: string;
  /** Raw axis label from the backend: "Mon", "W2", "Jan". */
  label: string;
  amount: number;
};

export type CategorySpend = {
  id: string;
  label: string;
  /** Stable category slug when known (drives the icon). */
  slug: string | null;
  amount: number;
  previousAmount: number;
};

export type CategoryMovement = {
  id: string;
  label: string;
  spent: number;
  /** Null for "new" / "no-change" — those render a label instead of a percentage. */
  deltaPct: number | null;
  changeKind: ChangeKind;
};

export type AiHighlight = {
  id: string;
  tone: 'positive' | 'warning';
  text: string;
};

export type InsightsData = {
  period: InsightsPeriod;
  /** The "today" the numbers were calculated for, `YYYY-MM-DD`. */
  referenceDate: string;
  /** False while the window is still running (always, for "today"). */
  isPeriodComplete: boolean;
  currentTotal: number;
  previousTotal: number;
  /**
   * False when tracking started after the previous window: its zero is "no
   * data", not "spent nothing", so nothing is compared against it.
   */
  hasPrevious: boolean;
  /** Null for "new" / "no-change" — those render a label instead of a percentage. */
  changePct: number | null;
  changeKind: ChangeKind;
  /** Absolute difference between the two periods. */
  deltaAmount: number;
  dailyAverage: number;
  /** Null when the backend did not report it. */
  transactionCount: number | null;
  /** Weekday with the highest spend, or null when unknown / no spending. */
  topWeekday: string | null;
  buckets: SpendBucket[];
  /** The user's monthly budget, when the backend (or the caller) knows it. */
  monthlyBudget: number | null;
  /** Spend per category in the current window, largest first. */
  categories: CategorySpend[];
  aiSummary: string;
  aiHighlights: AiHighlight[];
  movements: CategoryMovement[];
  /** ISO timestamp the summary was generated, null for example data. */
  generatedAt: string | null;
};
