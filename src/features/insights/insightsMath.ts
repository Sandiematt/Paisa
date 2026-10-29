import type {ChangeKind, InsightsData, InsightsPeriod, SpendBucket} from './insightsTypes';

// Pure period / chart / wording helpers for the Insights screen. Nothing here
// touches React, the network or the clock (callers pass dates in), so every
// function is unit-tested in __tests__/insightsMath.test.ts.

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export type IsoParts = {year: number; month: number; day: number};

export function parseIsoDate(iso: string): IsoParts {
  const [year, month, day] = iso.split('-').map(Number);
  return {year, month, day};
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Local calendar date as `YYYY-MM-DD`. */
export function localIsoDate(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Days covered by the current window up to `referenceDate`. Mirrors the backend windows. */
export function elapsedDays(period: InsightsPeriod, referenceDate: string): number {
  if (period === 'week') return 7;
  const {year, month, day} = parseIsoDate(referenceDate);
  if (period === 'month') return day;
  let days = day;
  for (let m = 1; m < month; m += 1) days += daysInMonth(year, m);
  return days;
}

function shiftIso(iso: string, days: number): string {
  const {year, month, day} = parseIsoDate(iso);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** First day of the current window, `YYYY-MM-DD`. */
export function windowStart(period: InsightsPeriod, referenceDate: string): string {
  if (period === 'week') return shiftIso(referenceDate, -6);
  const {year, month} = parseIsoDate(referenceDate);
  return period === 'month' ? `${year}-${String(month).padStart(2, '0')}-01` : `${year}-01-01`;
}

/** Last day of the previous window that is compared against, `YYYY-MM-DD`. */
export function previousWindowEnd(period: InsightsPeriod, referenceDate: string): string {
  if (period === 'week') return shiftIso(referenceDate, -7);
  const {year, month, day} = parseIsoDate(referenceDate);
  if (period === 'year') {
    return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, daysInMonth(year - 1, month))).padStart(2, '0')}`;
  }
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const prevDay = Math.min(day, daysInMonth(prevYear, prevMonth));
  return `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(prevDay).padStart(2, '0')}`;
}

/** Whole days from `from` through `to`, inclusive. */
function daysThrough(from: string, to: string): number {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000) + 1;
}

/**
 * Days of the current window the user was tracking: from the window start,
 * or `trackingSince` when that is later, through `referenceDate`.
 */
export function trackedDays(period: InsightsPeriod, referenceDate: string, trackingSince: string | null): number {
  const start = windowStart(period, referenceDate);
  const from = trackingSince && trackingSince > start ? trackingSince : start;
  return Math.max(1, daysThrough(from, referenceDate));
}

/**
 * Drops the leading buckets that end before tracking started, so the chart
 * does not draw empty weeks or months from before the app was set up. The
 * bucket tracking started in is kept.
 */
export function bucketsSince(buckets: SpendBucket[], trackingSince: string | null): SpendBucket[] {
  if (!trackingSince) return buckets;
  let first = 0;
  buckets.forEach((bucket, index) => {
    if (bucket.date <= trackingSince) first = index;
  });
  return first > 0 ? buckets.slice(first) : buckets;
}

export function averagePerDay(total: number, period: InsightsPeriod, referenceDate: string): number {
  const days = Math.max(1, elapsedDays(period, referenceDate));
  return Math.round((total / days) * 100) / 100;
}

export type PeriodLabels = {
  /** "in October", "in the last 7 days", "in 2026" */
  phrase: string;
  /** "Spent in October" */
  summaryTitle: string;
  /** Compare-bar label for the current window: "October" */
  currentLabel: string;
  /** Compare-bar label for the previous window: "September" */
  previousLabel: string;
  /** Extra context for the previous bar when it is a partial span: "first 24 days". */
  previousQualifier: string | null;
  /** How the delta sentence names the comparison: "September" / "the previous 7 days". */
  deltaTarget: string;
  /** Title of the bucket chart. */
  barsTitle: string;
  /** What one bucket is, for accessibility: "day" / "week" / "month". */
  bucketNoun: string;
};

/** Wording for each period. Week is the rolling last 7 days; month and year run to date. */
export function periodLabels(period: InsightsPeriod, referenceDate: string): PeriodLabels {
  const {year, month, day} = parseIsoDate(referenceDate);

  if (period === 'week') {
    return {
      phrase: 'in the last 7 days',
      summaryTitle: 'Spent in the last 7 days',
      currentLabel: 'Last 7 days',
      previousLabel: 'Previous 7 days',
      previousQualifier: null,
      deltaTarget: 'the previous 7 days',
      barsTitle: 'Spending by day',
      bucketNoun: 'day',
    };
  }

  if (period === 'year') {
    const lastDayOfYear = month === 12 && day >= 31;
    return {
      phrase: `in ${year}`,
      summaryTitle: `Spent in ${year}`,
      currentLabel: String(year),
      previousLabel: String(year - 1),
      previousQualifier: lastDayOfYear ? null : `to ${MONTH_SHORT[month - 1]} ${day}`,
      deltaTarget: String(year - 1),
      barsTitle: 'Spending by month',
      bucketNoun: 'month',
    };
  }

  const previousMonth = month === 1 ? 12 : month - 1;
  const previousYear = month === 1 ? year - 1 : year;
  const previousLength = daysInMonth(previousYear, previousMonth);
  const comparedDays = Math.min(day, previousLength);
  const previousName = MONTH_NAMES[previousMonth - 1];
  let qualifier: string | null = null;
  if (comparedDays < previousLength) {
    qualifier = comparedDays === 1 ? 'first day' : `first ${comparedDays} days`;
  }
  return {
    phrase: `in ${MONTH_NAMES[month - 1]}`,
    summaryTitle: `Spent in ${MONTH_NAMES[month - 1]}`,
    currentLabel: MONTH_NAMES[month - 1],
    previousLabel: previousName,
    previousQualifier: qualifier,
    deltaTarget: previousName,
    barsTitle: 'Spending by week',
    bucketNoun: 'week',
  };
}

/** Short name for the previous window, used in "vs ..." captions. */
export function previousPeriodLabel(period: InsightsPeriod, referenceDate: string): string {
  const labels = periodLabels(period, referenceDate);
  return period === 'week' ? 'previous 7 days' : labels.previousLabel;
}

// ---------------------------------------------------------------------------
// Delta wording
// ---------------------------------------------------------------------------

export type DeltaDescriptor = {
  /** good = spending fell (mint), bad = spending rose (roseLight), neutral = muted. */
  tone: 'good' | 'bad' | 'neutral';
  direction: 'down' | 'up' | 'flat';
  text: string;
};

/**
 * "₹4,210 (8%) less than September". Spending going down is the good outcome,
 * so a decrease is mint/down and an increase is roseLight/up.
 */
export function describeDelta(
  input: {changeKind: ChangeKind; deltaAmount: number; changePct: number | null; hasPrevious?: boolean},
  target: string,
  money: (value: number) => string,
): DeltaDescriptor {
  const {changeKind, deltaAmount, changePct} = input;
  if (input.hasPrevious === false) {
    return {tone: 'neutral', direction: 'flat', text: `Nothing to compare yet, you started tracking after ${target}`};
  }
  if (changeKind === 'no-change') {
    return {tone: 'neutral', direction: 'flat', text: `About the same as ${target}`};
  }
  if (changeKind === 'new') {
    return {tone: 'neutral', direction: 'up', text: `New spending, nothing recorded in ${target}`};
  }
  const pct = changePct === null ? '' : ` (${Math.abs(Math.round(changePct))}%)`;
  const amount = money(Math.abs(deltaAmount));
  if (changeKind === 'decrease') {
    return {tone: 'good', direction: 'down', text: `${amount}${pct} less than ${target}`};
  }
  return {tone: 'bad', direction: 'up', text: `${amount}${pct} more than ${target}`};
}

/** Bar fill fractions (0..1) for the current-vs-previous compare bars. */
export function compareFractions(current: number, previous: number): {current: number; previous: number} {
  const max = Math.max(current, previous);
  if (max <= 0) return {current: 0, previous: 0};
  return {current: Math.max(0, current / max), previous: Math.max(0, previous / max)};
}

// ---------------------------------------------------------------------------
// Bucket chart
// ---------------------------------------------------------------------------

/** Budget pace per bucket: a day (week), 7 days (month) or a month (year). Null without a budget. */
export function budgetPace(period: InsightsPeriod, monthlyBudget: number | null, referenceDate: string): number | null {
  if (monthlyBudget === null || !(monthlyBudget > 0)) return null;
  if (period === 'year') return monthlyBudget;
  const {year, month} = parseIsoDate(referenceDate);
  const perDay = monthlyBudget / daysInMonth(year, month);
  return period === 'week' ? perDay : perDay * 7;
}

/** Mean of the finished buckets, a fallback reference line when there is no budget. */
export function averagePace(buckets: SpendBucket[], isPeriodComplete: boolean): number | null {
  const finished = isPeriodComplete ? buckets : buckets.slice(0, -1);
  if (finished.length === 0) return null;
  const total = finished.reduce((sum, bucket) => sum + bucket.amount, 0);
  return total / finished.length;
}

export type BarState = 'normal' | 'over' | 'current';

export type SpendingBar = {
  label: string;
  amount: number;
  state: BarState;
};

export type SpendingBars = {
  bars: SpendingBar[];
  pace: number | null;
  /** budget = monthly budget spread over the bucket; average = mean of finished buckets. */
  paceKind: 'budget' | 'average' | null;
};

/** Axis label for a bucket: "W3" becomes "Week 3", and the running bucket reads "Today" / "This week". */
export function bucketLabel(period: InsightsPeriod, rawLabel: string, isRunning: boolean): string {
  if (period === 'week') return isRunning ? 'Today' : rawLabel;
  if (period === 'month') {
    if (isRunning) return 'This week';
    const match = /^W(\d+)$/.exec(rawLabel);
    return match ? `Week ${match[1]}` : rawLabel;
  }
  return rawLabel;
}

/**
 * Turns the backend buckets into bars. The running (last) bucket is hatched
 * and never judged against pace; finished buckets above the budget pace turn
 * rose. Without a budget there is no "over", just an average reference line.
 */
export function buildSpendingBars(
  data: Pick<InsightsData, 'period' | 'referenceDate' | 'isPeriodComplete' | 'buckets' | 'monthlyBudget'>,
): SpendingBars {
  const {period, referenceDate, isPeriodComplete, buckets, monthlyBudget} = data;
  const budget = budgetPace(period, monthlyBudget, referenceDate);
  const pace = budget ?? averagePace(buckets, isPeriodComplete);
  const paceKind = budget !== null ? 'budget' : pace !== null ? 'average' : null;

  const bars = buckets.map((bucket, index) => {
    const isRunning = !isPeriodComplete && index === buckets.length - 1;
    let state: BarState = 'normal';
    if (isRunning) state = 'current';
    else if (budget !== null && bucket.amount > budget) state = 'over';
    return {label: bucketLabel(period, bucket.label, isRunning), amount: bucket.amount, state};
  });

  return {bars, pace, paceKind};
}

/** "12.9k", "1.2M", "940": for bar captions that have little room. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  const trim = (n: number, digits: number) => n.toFixed(digits).replace(/\.0+$/, '');
  if (abs >= 1_000_000) return `${trim(value / 1_000_000, 1)}M`;
  if (abs >= 100_000) return `${trim(value / 1_000, 0)}k`;
  if (abs >= 1_000) return `${trim(value / 1_000, 1)}k`;
  return String(Math.round(value));
}

/** Biggest-spend weekday from week buckets (their labels are weekdays), else null. */
export function topWeekdayFromBuckets(period: InsightsPeriod, buckets: SpendBucket[]): string | null {
  if (period !== 'week') return null;
  let best: SpendBucket | null = null;
  for (const bucket of buckets) {
    if (bucket.amount > 0 && (best === null || bucket.amount > best.amount)) best = bucket;
  }
  return best ? best.label : null;
}

// ---------------------------------------------------------------------------
// Category rows
// ---------------------------------------------------------------------------

export type CategoryRowModel = {
  id: string;
  label: string;
  slug: string | null;
  amount: number;
  /** Bar fill relative to the biggest category (0..1). */
  fraction: number;
  /** Share of all category spend, 0..100 (rounded). */
  sharePct: number;
};

export function buildCategoryRows(categories: InsightsData['categories']): CategoryRowModel[] {
  const positive = categories.filter(category => category.amount > 0).sort((a, b) => b.amount - a.amount);
  const max = positive.length > 0 ? positive[0].amount : 0;
  const total = positive.reduce((sum, category) => sum + category.amount, 0);
  return positive.map(category => ({
    id: category.id,
    label: category.label,
    slug: category.slug,
    amount: category.amount,
    fraction: max > 0 ? category.amount / max : 0,
    sharePct: total > 0 ? Math.round((category.amount / total) * 100) : 0,
  }));
}

// ---------------------------------------------------------------------------
// Copy
// ---------------------------------------------------------------------------

/** Short plain-text summary handed to the system share sheet. */
export function buildShareText(
  data: Pick<
    InsightsData,
    'period' | 'referenceDate' | 'currentTotal' | 'changeKind' | 'deltaAmount' | 'changePct' | 'categories'
  > & {hasPrevious?: boolean},
  money: (value: number) => string,
): string {
  const labels = periodLabels(data.period, data.referenceDate);
  const delta = describeDelta(data, labels.deltaTarget, money);
  const lines = [`${labels.summaryTitle}: ${money(data.currentTotal)}`, delta.text];
  const top = buildCategoryRows(data.categories).slice(0, 3);
  if (top.length > 0) {
    lines.push(`Top categories: ${top.map(row => `${row.label} ${money(row.amount)}`).join(', ')}`);
  }
  lines.push('Tracked with Paisa');
  return lines.join('\n');
}

/** "just now", "12 min ago", "3 h ago", or a short date. */
export function updatedLabel(generatedAt: string | null, now: Date): string {
  if (!generatedAt) return 'Example data';
  const then = new Date(generatedAt);
  const diffMs = now.getTime() - then.getTime();
  if (Number.isNaN(diffMs)) return 'Updated recently';
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} h ago`;
  return `Updated ${MONTH_SHORT[then.getMonth()]} ${then.getDate()}`;
}

/** True when a load error reads like a connectivity problem rather than a server one. */
export function isOfflineError(message: string | null): boolean {
  if (!message) return false;
  return /reach the server|connection|network|offline|failed to send|fetch/i.test(message);
}
