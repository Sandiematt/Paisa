import {formatMoney} from '../../lib/formatMoney';
import {daysInMonth, elapsedDays, localIsoDate, MONTH_SHORT, parseIsoDate} from './insightsMath';
import type {
  CategoryMovement,
  CategorySpend,
  ChangeKind,
  InsightsData,
  InsightsPeriod,
  SpendBucket,
} from './insightsTypes';

export type {
  AiHighlight,
  CategoryMovement,
  ChangeKind,
  InsightsData,
  InsightsPeriod,
} from './insightsTypes';
export {previousPeriodLabel} from './insightsMath';

// Example numbers shown while the backend is unreachable (and for signed-out
// previews). They are shaped exactly like live data so the screen renders the
// same components either way.

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EXAMPLE_BUDGET = 3000;

const WEEK_AMOUNTS = [180, 95, 140, 60, 210, 35, 20];
const MONTH_CHUNK_AMOUNTS = [840, 1105, 640, 376, 300];
const YEAR_MONTH_AMOUNTS = [3380, 3120, 3510, 2980, 3260, 3050, 3420, 3190, 3340, 2961, 3010, 3280];

const CATEGORY_SHARES: {id: string; label: string; slug: string; share: number; previousShare: number}[] = [
  {id: 'dining', label: 'Dining', slug: 'dining', share: 0.32, previousShare: 0.36},
  {id: 'groceries', label: 'Groceries', slug: 'groceries', share: 0.24, previousShare: 0.24},
  {id: 'transport', label: 'Transport', slug: 'transport', share: 0.17, previousShare: 0.15},
  {id: 'bills', label: 'Bills', slug: 'bills', share: 0.15, previousShare: 0.14},
  {id: 'shopping', label: 'Shopping', slug: 'shopping', share: 0.12, previousShare: 0.11},
];

function addDaysIso(iso: string, days: number): string {
  const {year, month, day} = parseIsoDate(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function weekdayOf(iso: string): string {
  const {year, month, day} = parseIsoDate(iso);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function exampleBuckets(period: InsightsPeriod, referenceDate: string): SpendBucket[] {
  const {year, month, day} = parseIsoDate(referenceDate);

  if (period === 'week') {
    return WEEK_AMOUNTS.map((amount, index) => {
      const date = addDaysIso(referenceDate, index - 6);
      return {date, label: weekdayOf(date), amount};
    });
  }

  if (period === 'year') {
    return YEAR_MONTH_AMOUNTS.slice(0, month).map((amount, index) => ({
      date: `${year}-${String(index + 1).padStart(2, '0')}-01`,
      label: MONTH_SHORT[index],
      amount,
    }));
  }

  const chunks = Math.min(MONTH_CHUNK_AMOUNTS.length, Math.ceil(day / 7));
  const monthDays = daysInMonth(year, month);
  return MONTH_CHUNK_AMOUNTS.slice(0, chunks).map((amount, index) => {
    const startDay = Math.min(monthDays, index * 7 + 1);
    return {
      date: `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`,
      label: `W${index + 1}`,
      amount,
    };
  });
}

function comparison(current: number, previous: number): {kind: ChangeKind; pct: number | null; delta: number} {
  const delta = Math.abs(previous - current);
  if (delta < 1) return {kind: 'no-change', pct: null, delta: 0};
  if (previous <= 0) return {kind: 'new', pct: null, delta};
  const pct = Math.round(((current - previous) / previous) * 100);
  return {kind: current > previous ? 'increase' : 'decrease', pct, delta};
}

function exampleMovements(period: InsightsPeriod): CategoryMovement[] {
  if (period === 'week') {
    return [
      {id: 'dining', label: 'Dining', spent: 62, deltaPct: -22, changeKind: 'decrease'},
      {id: 'shopping', label: 'Shopping', spent: 21, deltaPct: -18, changeKind: 'decrease'},
      {id: 'groceries', label: 'Groceries', spent: 96, deltaPct: -4, changeKind: 'decrease'},
      {id: 'subscriptions', label: 'Subscriptions', spent: 60, deltaPct: 6, changeKind: 'increase'},
      {id: 'transport', label: 'Transport', spent: 41, deltaPct: 12, changeKind: 'increase'},
    ];
  }
  if (period === 'year') {
    return [
      {id: 'dining', label: 'Dining', spent: 3190, deltaPct: -14, changeKind: 'decrease'},
      {id: 'shopping', label: 'Shopping', spent: 1070, deltaPct: -26, changeKind: 'decrease'},
      {id: 'groceries', label: 'Groceries', spent: 4940, deltaPct: -3, changeKind: 'decrease'},
      {id: 'subscriptions', label: 'Subscriptions', spent: 2880, deltaPct: 11, changeKind: 'increase'},
      {id: 'transport', label: 'Transport', spent: 2140, deltaPct: 8, changeKind: 'increase'},
    ];
  }
  return [
    {id: 'dining', label: 'Dining', spent: 266, deltaPct: -18, changeKind: 'decrease'},
    {id: 'shopping', label: 'Shopping', spent: 89, deltaPct: -31, changeKind: 'decrease'},
    {id: 'groceries', label: 'Groceries', spent: 412, deltaPct: -6, changeKind: 'decrease'},
    {id: 'subscriptions', label: 'Subscriptions', spent: 240, deltaPct: 14, changeKind: 'increase'},
    {id: 'transport', label: 'Transport', spent: 178, deltaPct: 9, changeKind: 'increase'},
  ];
}

export function insightsData(
  currencySymbol: string,
  period: InsightsPeriod = 'month',
  now: Date = new Date(),
): InsightsData {
  const money = (value: number) => formatMoney(value, currencySymbol, {decimals: 0});
  const referenceDate = localIsoDate(now);
  const buckets = exampleBuckets(period, referenceDate);
  const currentTotal = buckets.reduce((sum, bucket) => sum + bucket.amount, 0);
  const previousFactor = period === 'week' ? 1.09 : period === 'year' ? 1.075 : 1.14;
  const previousTotal = Math.round(currentTotal * previousFactor);
  const change = comparison(currentTotal, previousTotal);

  const categories: CategorySpend[] = CATEGORY_SHARES.map(category => ({
    id: category.id,
    label: category.label,
    slug: category.slug,
    amount: Math.round(currentTotal * category.share),
    previousAmount: Math.round(previousTotal * category.previousShare),
  }));

  const days = elapsedDays(period, referenceDate);

  const topBucket = buckets.reduce((best, bucket) => (bucket.amount > best.amount ? bucket : best), buckets[0]);
  const topWeekday = period === 'week' ? topBucket.label : 'Sat';

  const word = period === 'week' ? 'last 7 days' : period === 'year' ? 'year' : 'month';
  const compared = period === 'week' ? 'the 7 days before' : period === 'year' ? 'last year' : 'last month';
  const pctText = change.pct === null ? '' : `${Math.abs(change.pct)}%`;

  return {
    period,
    referenceDate,
    isPeriodComplete: false,
    currentTotal,
    previousTotal,
    changePct: change.pct,
    changeKind: change.kind,
    deltaAmount: change.delta,
    dailyAverage: Math.round(currentTotal / days),
    transactionCount: Math.max(1, Math.round(currentTotal / 24)),
    topWeekday,
    buckets,
    monthlyBudget: EXAMPLE_BUDGET,
    categories,
    aiSummary: `You're spending ${pctText} less than ${compared}, mostly from cutting back on dining and shopping. Groceries are steady and transport crept up a little. At this pace you'll finish the ${word} about ${money(
      Math.round(change.delta / 2),
    )} under.`,
    aiHighlights: [
      {id: '1', tone: 'positive', text: `Dining down ${money(Math.round(change.delta * 0.43))} vs ${compared}`},
      {id: '2', tone: 'warning', text: `Transport crept up ${money(Math.round(change.delta * 0.14))} this ${period}`},
    ],
    movements: exampleMovements(period),
    generatedAt: null,
  };
}
