// Deterministic, pure statistics calculations for Paisa Insights.
//
// CRITICAL: This module never talks to the AI. Every number the app or the
// AI ever sees for insights is produced here, in plain TypeScript, from raw
// transactions. The AI is only ever handed the *output* of this module
// (see ai.ts) and is never allowed to compute or alter a number.

import type {
  CalculatedStats,
  CategoryChangeStats,
  CategoryRef,
  ChangeKind,
  Direction,
  Highlight,
  PatternChangeStats,
  PeriodComparisonStats,
  PeriodKind,
  ProfileRecord,
  RecurringPaymentItem,
  RecurringPaymentsStats,
  SavingsProgressStats,
  TransactionRecord,
  TrendBucketStat,
  UnusualSpendingStats,
} from './types.ts';

// Ledger markers written by the app for opening balance / manual balance
// adjustments (see src/lib/transactionsStore.ts). These aren't organic
// spending or income, so they're excluded from every insight calculation.
const OPENING_BALANCE_NOTE = 'opening_balance';
const BALANCE_ADJUSTMENT_NOTE = 'balance_adjustment';

const MIN_CATEGORY_DELTA = 20; // ₹ — ignore noise smaller than this
const UNUSUAL_CATEGORY_SLUGS = ['dining', 'shopping'];
const UNUSUAL_RATIO_THRESHOLD = 1.4; // 40% above the trailing average
const UNUSUAL_MIN_DELTA = 150; // ₹ — minimum absolute jump to bother flagging
const SIGNIFICANT_OVERALL_RATIO = 1.25; // ±25% vs. baseline overall
const SIGNIFICANT_CATEGORY_RATIO = 1.5; // ±50% vs. previous period, per category
const NO_CHANGE_EPSILON = 1; // ₹ — changes smaller than this read as "no change"
const MAX_HIGHLIGHTS = 5;

const MONTH_BASELINE_PERIODS = 3; // trailing 3 months, same-day-range each
const WEEK_BASELINE_PERIODS = 4; // trailing 4 weeks

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// ---------------------------------------------------------------------------
// Date helpers (all dates are plain `YYYY-MM-DD` calendar strings, UTC-based
// to match the `date` column type on `transactions.transaction_date`)
// ---------------------------------------------------------------------------

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseDateUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function formatDateUTC(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const date = parseDateUTC(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return formatDateUTC(date);
}

function addMonths(iso: string, months: number): string {
  const [year, month] = iso.split('-').map(Number);
  return formatDateUTC(new Date(Date.UTC(year, month - 1 + months, 1)));
}

function monthStartOf(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

function daysInMonthUTC(year: number, month1based: number): number {
  return new Date(Date.UTC(year, month1based, 0)).getUTCDate();
}

function daysInMonthOf(iso: string): number {
  const [year, month] = iso.split('-').map(Number);
  return daysInMonthUTC(year, month);
}

function daysBetweenInclusive(startIso: string, endIso: string): number {
  return Math.round((parseDateUTC(endIso).getTime() - parseDateUTC(startIso).getTime()) / 86_400_000) + 1;
}

/** Clamps `candidateIso` so it never spills past the last day of `monthStartIso`'s month. */
function clampToMonthEnd(monthStartIso: string, candidateIso: string): string {
  const targetMonth = monthStartIso.slice(0, 7);
  if (candidateIso.slice(0, 7) === targetMonth) return candidateIso;
  const [year, month] = monthStartIso.split('-').map(Number);
  return `${targetMonth}-${String(daysInMonthUTC(year, month)).padStart(2, '0')}`;
}

/** Clamps `candidateIso` so it never spills past Dec 31 of `yearStartIso`'s year. */
function clampToYearEnd(yearStartIso: string, candidateIso: string): string {
  const targetYear = yearStartIso.slice(0, 4);
  if (candidateIso.slice(0, 4) === targetYear) return candidateIso;
  return `${targetYear}-12-31`;
}

function inRange(dateIso: string, startIso: string, endIso: string): boolean {
  return dateIso >= startIso && dateIso <= endIso;
}

// ---------------------------------------------------------------------------
// Period windows — the current/previous/baseline date ranges for whichever
// period the client asked for. This is the one place "week vs. month vs.
// year" logic lives; every calculation below just takes plain date ranges.
// ---------------------------------------------------------------------------

interface PeriodWindows {
  currentStart: string;
  currentEnd: string;
  previousStart: string;
  previousEnd: string;
  baselineStart: string;
  baselineEnd: string;
  baselinePeriods: number;
}

function computePeriodWindows(period: PeriodKind, referenceDate: string): PeriodWindows {
  if (period === 'week') {
    const currentStart = addDays(referenceDate, -6);
    const currentEnd = referenceDate;
    const previousEnd = addDays(currentStart, -1);
    const previousStart = addDays(previousEnd, -6);
    const baselineStart = addDays(currentStart, -WEEK_BASELINE_PERIODS * 7);
    const baselineEnd = addDays(currentStart, -1);
    return {currentStart, currentEnd, previousStart, previousEnd, baselineStart, baselineEnd, baselinePeriods: WEEK_BASELINE_PERIODS};
  }

  if (period === 'month') {
    const currentStart = monthStartOf(referenceDate);
    const currentEnd = referenceDate;
    const elapsedDays = daysBetweenInclusive(currentStart, currentEnd);

    const previousStart = addMonths(currentStart, -1);
    const previousEnd = clampToMonthEnd(previousStart, addDays(previousStart, elapsedDays - 1));

    const baselineStart = addMonths(currentStart, -(1 + MONTH_BASELINE_PERIODS));
    const baselineEnd = addDays(previousStart, -1);
    return {currentStart, currentEnd, previousStart, previousEnd, baselineStart, baselineEnd, baselinePeriods: MONTH_BASELINE_PERIODS};
  }

  // year
  const currentYear = Number(referenceDate.slice(0, 4));
  const currentStart = `${currentYear}-01-01`;
  const currentEnd = referenceDate;
  const elapsedDays = daysBetweenInclusive(currentStart, currentEnd);

  const previousStart = `${currentYear - 1}-01-01`;
  const previousEnd = clampToYearEnd(previousStart, addDays(previousStart, elapsedDays - 1));

  // Most users won't have multiple prior years of data, so the baseline for
  // "unusual spending" / "pattern changes" just reuses the previous year's
  // same-range window rather than reaching further back.
  return {currentStart, currentEnd, previousStart, previousEnd, baselineStart: previousStart, baselineEnd: previousEnd, baselinePeriods: 1};
}

/** Earliest date the caller needs to fetch to cover every window for this period. */
export function earliestDateNeeded(period: PeriodKind, referenceDate: string): string {
  const windows = computePeriodWindows(period, referenceDate);
  const monthStart = monthStartOf(referenceDate); // savings progress always looks at the current month
  return windows.baselineStart < monthStart ? windows.baselineStart : monthStart;
}

function previousPeriodLabel(period: PeriodKind): string {
  if (period === 'month') return 'last month';
  if (period === 'year') return 'last year';
  return 'last week';
}

function periodNoun(period: PeriodKind): string {
  if (period === 'month') return 'month';
  if (period === 'year') return 'year';
  return 'week';
}

// ---------------------------------------------------------------------------
// Small numeric helpers
// ---------------------------------------------------------------------------

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundInt(value: number): number {
  return Math.round(value);
}

function sumAmounts(rows: TransactionRecord[]): number {
  return roundMoney(rows.reduce((total, row) => total + row.amount, 0));
}

/** Percent change from `previous` to `current`, or `null` if undefined (previous is ~0). */
function percentChange(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.005) {
    return current > 0.005 ? null : 0;
  }
  return roundInt(((current - previous) / previous) * 100);
}

function directionFromDelta(delta: number): Direction {
  if (Math.abs(delta) < NO_CHANGE_EPSILON) return 'flat';
  return delta > 0 ? 'up' : 'down';
}

/**
 * Classifies a current-vs-previous comparison per the table in types.ts:
 * only "increase"/"decrease" get a meaningful percentage — "new" and
 * "no-change" are display states, not percentages.
 */
function deriveChangeKind(current: number, previous: number): ChangeKind {
  const delta = current - previous;
  if (Math.abs(delta) < NO_CHANGE_EPSILON) return 'no-change';
  if (previous < 0.005) return 'new';
  return delta > 0 ? 'increase' : 'decrease';
}

function isLedgerEntry(row: TransactionRecord): boolean {
  return row.notes === OPENING_BALANCE_NOTE || row.notes === BALANCE_ADJUSTMENT_NOTE;
}

function categoryKeyOf(category: CategoryRef | null): string {
  if (!category) return 'uncategorized';
  return (category.slug ?? category.name).toLowerCase();
}

function categoryLabelOf(category: CategoryRef | null): string {
  return category?.name ?? 'Uncategorized';
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0].toUpperCase() + value.slice(1);
}

/** Sums expense amounts within [start, end] grouped by category key. */
function groupExpensesByCategory(
  rows: TransactionRecord[],
  start: string,
  end: string,
): Map<string, {amount: number; label: string}> {
  const map = new Map<string, {amount: number; label: string}>();
  for (const row of rows) {
    if (row.type !== 'expense' || isLedgerEntry(row)) continue;
    if (!inRange(row.transactionDate, start, end)) continue;
    const key = categoryKeyOf(row.category);
    const label = categoryLabelOf(row.category);
    const existing = map.get(key);
    map.set(key, {amount: (existing?.amount ?? 0) + row.amount, label: existing?.label ?? label});
  }
  return map;
}

// ---------------------------------------------------------------------------
// 1. Spending increased / decreased
// ---------------------------------------------------------------------------

function computePeriodComparison(
  transactions: TransactionRecord[],
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string,
): PeriodComparisonStats {
  const expenses = transactions.filter(t => t.type === 'expense' && !isLedgerEntry(t));
  const currentTotal = sumAmounts(expenses.filter(t => inRange(t.transactionDate, currentStart, currentEnd)));
  const previousTotal = sumAmounts(expenses.filter(t => inRange(t.transactionDate, previousStart, previousEnd)));
  const changeAmount = roundMoney(currentTotal - previousTotal);

  return {
    currentTotal,
    previousTotal,
    changeAmount,
    changePercent: percentChange(currentTotal, previousTotal),
    direction: directionFromDelta(changeAmount),
    changeKind: deriveChangeKind(currentTotal, previousTotal),
  };
}

// ---------------------------------------------------------------------------
// 2. Category changes
// ---------------------------------------------------------------------------

function computeCategoryChanges(
  transactions: TransactionRecord[],
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string,
): CategoryChangeStats[] {
  const currentMap = groupExpensesByCategory(transactions, currentStart, currentEnd);
  const previousMap = groupExpensesByCategory(transactions, previousStart, previousEnd);
  const keys = new Set<string>([...currentMap.keys(), ...previousMap.keys()]);

  const results: CategoryChangeStats[] = [];
  for (const key of keys) {
    const currentAmount = roundMoney(currentMap.get(key)?.amount ?? 0);
    const previousAmount = roundMoney(previousMap.get(key)?.amount ?? 0);
    const changeAmount = roundMoney(currentAmount - previousAmount);
    if (Math.abs(changeAmount) < MIN_CATEGORY_DELTA) continue;

    const label = currentMap.get(key)?.label ?? previousMap.get(key)?.label ?? capitalize(key);
    results.push({
      category: label,
      currentAmount,
      previousAmount,
      changeAmount,
      changePercent: percentChange(currentAmount, previousAmount),
      direction: directionFromDelta(changeAmount),
      changeKind: deriveChangeKind(currentAmount, previousAmount),
    });
  }

  return results.sort((a, b) => Math.abs(b.changeAmount) - Math.abs(a.changeAmount));
}

// ---------------------------------------------------------------------------
// 3. Unusually high Dining / Shopping spending
// ---------------------------------------------------------------------------

function computeUnusualSpending(
  transactions: TransactionRecord[],
  currentStart: string,
  currentEnd: string,
  baselineStart: string,
  baselineEnd: string,
  baselinePeriods: number,
): UnusualSpendingStats[] {
  const currentMap = groupExpensesByCategory(transactions, currentStart, currentEnd);
  const baselineMap = groupExpensesByCategory(transactions, baselineStart, baselineEnd);
  const divisor = Math.max(1, baselinePeriods);

  const out: UnusualSpendingStats[] = [];
  for (const slug of UNUSUAL_CATEGORY_SLUGS) {
    const current = currentMap.get(slug);
    const baseline = baselineMap.get(slug);
    if (!current && !baseline) continue;

    const currentAmount = roundMoney(current?.amount ?? 0);
    const averageAmount = roundMoney((baseline?.amount ?? 0) / divisor);
    const label = current?.label ?? baseline?.label ?? capitalize(slug);

    if (averageAmount <= 0) {
      if (currentAmount >= UNUSUAL_MIN_DELTA) {
        out.push({category: label, currentAmount, averageAmount: 0, percentAboveAverage: null, isNewSpending: true});
      }
      continue;
    }

    const ratio = currentAmount / averageAmount;
    const absoluteDelta = currentAmount - averageAmount;
    if (ratio >= UNUSUAL_RATIO_THRESHOLD && absoluteDelta >= UNUSUAL_MIN_DELTA) {
      out.push({
        category: label,
        currentAmount,
        averageAmount,
        percentAboveAverage: roundInt((ratio - 1) * 100),
        isNewSpending: false,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// 4. Recurring payments
// ---------------------------------------------------------------------------

function computeRecurringPayments(
  transactions: TransactionRecord[],
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string,
): RecurringPaymentsStats {
  const recurring = transactions.filter(t => t.isRecurring && t.type === 'expense' && !isLedgerEntry(t));

  const byKey = new Map<string, RecurringPaymentItem>();
  for (const row of recurring) {
    const merchant = row.merchant ?? row.description ?? 'Recurring payment';
    const key = `${merchant.toLowerCase()}|${row.amount}`;
    const existing = byKey.get(key);
    if (!existing || row.transactionDate > existing.lastChargedOn) {
      byKey.set(key, {
        merchant,
        category: row.category ? categoryLabelOf(row.category) : null,
        amount: roundMoney(row.amount),
        lastChargedOn: row.transactionDate,
      });
    }
  }

  const items = [...byKey.values()]
    .sort((a, b) => (a.lastChargedOn < b.lastChargedOn ? 1 : -1))
    .slice(0, 10);

  const currentTotal = sumAmounts(recurring.filter(t => inRange(t.transactionDate, currentStart, currentEnd)));
  const previousTotal = sumAmounts(recurring.filter(t => inRange(t.transactionDate, previousStart, previousEnd)));

  return {
    items,
    currentTotal,
    previousTotal,
    changePercent: percentChange(currentTotal, previousTotal),
  };
}

// ---------------------------------------------------------------------------
// 5. Savings target progress (always calendar-month based — the app only
//    stores a monthly savings goal, regardless of which period is displayed)
// ---------------------------------------------------------------------------

function computeSavingsProgress(
  transactions: TransactionRecord[],
  profile: ProfileRecord | null,
  referenceDate: string,
): SavingsProgressStats {
  const monthStart = monthStartOf(referenceDate);
  const monthRows = transactions.filter(t => !isLedgerEntry(t) && inRange(t.transactionDate, monthStart, referenceDate));

  const income = sumAmounts(monthRows.filter(t => t.type === 'income'));
  const expense = sumAmounts(monthRows.filter(t => t.type === 'expense'));
  const savedSoFarThisMonth = roundMoney(income - expense);

  const daysElapsed = Number(referenceDate.slice(8, 10));
  const daysInMonth = daysInMonthOf(referenceDate);

  const goal = profile?.monthlySavingsGoal ?? null;
  if (goal === null || goal <= 0) {
    return {
      goalSet: false,
      monthlySavingsGoal: null,
      savedSoFarThisMonth,
      percentOfGoal: null,
      projectedMonthEndSavings: null,
      onTrack: null,
    };
  }

  const projectedMonthEndSavings =
    daysElapsed > 0 ? roundMoney((savedSoFarThisMonth / daysElapsed) * daysInMonth) : savedSoFarThisMonth;
  const expectedByNow = roundMoney((goal / daysInMonth) * daysElapsed);

  return {
    goalSet: true,
    monthlySavingsGoal: roundMoney(goal),
    savedSoFarThisMonth,
    percentOfGoal: roundInt((savedSoFarThisMonth / goal) * 100),
    projectedMonthEndSavings,
    onTrack: savedSoFarThisMonth >= expectedByNow,
  };
}

// ---------------------------------------------------------------------------
// 6. Significant spending-pattern changes
// ---------------------------------------------------------------------------

function computePatternChanges(
  periodComparison: PeriodComparisonStats,
  baselinePeriodAverage: number,
  categoryChanges: CategoryChangeStats[],
): PatternChangeStats[] {
  const out: PatternChangeStats[] = [];

  if (baselinePeriodAverage > 0) {
    const ratio = periodComparison.currentTotal / baselinePeriodAverage;
    if (ratio >= SIGNIFICANT_OVERALL_RATIO || ratio <= 1 / SIGNIFICANT_OVERALL_RATIO) {
      out.push({
        scope: 'overall',
        label: 'Overall spending',
        changePercent: roundInt((ratio - 1) * 100),
        direction: ratio > 1 ? 'up' : 'down',
        amount: roundMoney(periodComparison.currentTotal - baselinePeriodAverage),
      });
    }
  }

  for (const change of categoryChanges) {
    if (change.previousAmount > 0) {
      const ratio = change.currentAmount / change.previousAmount;
      const isSignificant = ratio >= SIGNIFICANT_CATEGORY_RATIO || ratio <= 1 / SIGNIFICANT_CATEGORY_RATIO;
      if (isSignificant) {
        out.push({
          scope: 'category',
          label: change.category,
          changePercent: change.changePercent ?? 0,
          direction: change.direction,
          amount: change.changeAmount,
        });
      }
    } else if (change.currentAmount >= MIN_CATEGORY_DELTA * 2) {
      out.push({
        scope: 'category',
        label: change.category,
        changePercent: 100,
        direction: 'up',
        amount: change.changeAmount,
      });
    }
  }

  return out.sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent)).slice(0, 5);
}

// ---------------------------------------------------------------------------
// Trend buckets — a chart display aid, not an insight
// ---------------------------------------------------------------------------

function bucketAmount(transactions: TransactionRecord[], start: string, end: string): number {
  return sumAmounts(
    transactions.filter(t => t.type === 'expense' && !isLedgerEntry(t) && inRange(t.transactionDate, start, end)),
  );
}

function buildTrendBuckets(
  transactions: TransactionRecord[],
  currentStart: string,
  currentEnd: string,
  period: PeriodKind,
): TrendBucketStat[] {
  if (period === 'week') {
    const buckets: TrendBucketStat[] = [];
    let cursor = currentStart;
    while (cursor <= currentEnd) {
      const [year, month, day] = cursor.split('-').map(Number);
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      buckets.push({date: cursor, amount: bucketAmount(transactions, cursor, cursor), label: WEEKDAY_LABELS[weekday]});
      cursor = addDays(cursor, 1);
    }
    return buckets;
  }

  if (period === 'month') {
    const buckets: TrendBucketStat[] = [];
    let cursor = currentStart;
    let index = 1;
    while (cursor <= currentEnd) {
      const bucketEnd = addDays(cursor, 6) > currentEnd ? currentEnd : addDays(cursor, 6);
      buckets.push({date: cursor, amount: bucketAmount(transactions, cursor, bucketEnd), label: `W${index}`});
      cursor = addDays(bucketEnd, 1);
      index += 1;
    }
    return buckets;
  }

  // year: one bucket per month, Jan through the current month
  const buckets: TrendBucketStat[] = [];
  const year = Number(currentStart.slice(0, 4));
  const currentMonthIndex = Number(currentEnd.slice(5, 7));
  for (let month = 1; month <= currentMonthIndex; month += 1) {
    const bucketStart = `${year}-${String(month).padStart(2, '0')}-01`;
    const fullMonthEnd = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonthUTC(year, month)).padStart(2, '0')}`;
    const bucketEnd = month === currentMonthIndex ? currentEnd : fullMonthEnd;
    buckets.push({date: bucketStart, amount: bucketAmount(transactions, bucketStart, bucketEnd), label: MONTH_LABELS[month - 1]});
  }
  return buckets;
}

// ---------------------------------------------------------------------------
// Highlights (fully deterministic — the AI never touches these)
// ---------------------------------------------------------------------------

function formatCurrency(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', {maximumFractionDigits: 0}).format(Math.round(Math.abs(amount)))}`;
}

function buildHighlights(stats: CalculatedStats): Highlight[] {
  const highlights: Highlight[] = [];
  const coveredCategories = new Set<string>();
  const comparisonLabel = previousPeriodLabel(stats.period);

  for (const unusual of stats.unusualSpending) {
    coveredCategories.add(unusual.category.toLowerCase());
    const text = unusual.isNewSpending
      ? `${unusual.category} spending is new this ${periodNoun(stats.period)} — ${formatCurrency(unusual.currentAmount)}`
      : `${unusual.category} is ${unusual.percentAboveAverage}% above your usual ${periodNoun(stats.period)} (${formatCurrency(
          unusual.currentAmount,
        )})`;
    highlights.push({
      category: unusual.category,
      text,
      direction: 'up',
      amount: roundInt(unusual.currentAmount - unusual.averageAmount),
    });
  }

  for (const change of stats.categoryChanges) {
    if (coveredCategories.has(change.category.toLowerCase())) continue;
    coveredCategories.add(change.category.toLowerCase());

    let text: string;
    if (change.changeKind === 'new') {
      text = `${change.category} is new spending vs ${comparisonLabel} — ${formatCurrency(change.currentAmount)}`;
    } else {
      const verb = change.direction === 'down' ? 'down' : 'up';
      text = `${change.category} ${verb} ${formatCurrency(change.changeAmount)} vs ${comparisonLabel}`;
    }

    highlights.push({
      category: change.category,
      text,
      direction: change.changeKind === 'new' ? 'up' : change.direction,
      amount: roundInt(Math.abs(change.changeAmount)),
    });
    if (highlights.length >= MAX_HIGHLIGHTS) break;
  }

  if (highlights.length < MAX_HIGHLIGHTS && stats.savingsProgress.goalSet && stats.savingsProgress.percentOfGoal !== null) {
    const {percentOfGoal, monthlySavingsGoal, savedSoFarThisMonth, onTrack} = stats.savingsProgress;
    highlights.push({
      category: 'Savings',
      text: `${percentOfGoal}% of your ${formatCurrency(monthlySavingsGoal ?? 0)} savings goal reached`,
      direction: onTrack ? 'up' : 'down',
      amount: roundInt(savedSoFarThisMonth),
    });
  }

  if (highlights.length < MAX_HIGHLIGHTS && stats.recurringPayments.items.length > 0 && stats.recurringPayments.currentTotal > 0) {
    const {items, currentTotal} = stats.recurringPayments;
    highlights.push({
      category: 'Recurring',
      text: `${items.length} recurring payment${items.length === 1 ? '' : 's'} totaling ${formatCurrency(
        currentTotal,
      )} this ${periodNoun(stats.period)}`,
      direction: 'flat',
      amount: roundInt(currentTotal),
    });
  }

  return highlights.slice(0, MAX_HIGHLIGHTS);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function calculateInsightStats(
  transactions: TransactionRecord[],
  profile: ProfileRecord | null,
  referenceDate: string,
  period: PeriodKind = 'week',
): {stats: CalculatedStats; highlights: Highlight[]} {
  const windows = computePeriodWindows(period, referenceDate);
  const {currentStart, currentEnd, previousStart, previousEnd, baselineStart, baselineEnd, baselinePeriods} = windows;

  const periodComparison = computePeriodComparison(transactions, currentStart, currentEnd, previousStart, previousEnd);
  const categoryChanges = computeCategoryChanges(transactions, currentStart, currentEnd, previousStart, previousEnd);
  const unusualSpending = computeUnusualSpending(transactions, currentStart, currentEnd, baselineStart, baselineEnd, baselinePeriods);
  const recurringPayments = computeRecurringPayments(transactions, currentStart, currentEnd, previousStart, previousEnd);
  const savingsProgress = computeSavingsProgress(transactions, profile, referenceDate);

  const baselineExpenses = transactions.filter(
    t => t.type === 'expense' && !isLedgerEntry(t) && inRange(t.transactionDate, baselineStart, baselineEnd),
  );
  const baselinePeriodAverage = roundMoney(sumAmounts(baselineExpenses) / Math.max(1, baselinePeriods));
  const patternChanges = computePatternChanges(periodComparison, baselinePeriodAverage, categoryChanges);

  const trendBuckets = buildTrendBuckets(transactions, currentStart, currentEnd, period);

  const stats: CalculatedStats = {
    referenceDate,
    period,
    // A period requested for "today" is still in progress — more transactions
    // could still land later today, so it's never a finished summary. Only a
    // period ending strictly before today (an explicit past referenceDate) is
    // complete.
    isPeriodComplete: referenceDate < todayISO(),
    currency: profile?.currency ?? 'INR',
    periodComparison,
    categoryChanges,
    unusualSpending,
    recurringPayments,
    savingsProgress,
    patternChanges,
    trendBuckets,
  };

  return {stats, highlights: buildHighlights(stats)};
}
