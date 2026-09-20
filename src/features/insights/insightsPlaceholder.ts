import {formatMoney} from '../../lib/formatMoney';

export type InsightsPeriod = 'week' | 'month' | 'year';

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

export type WeeklyBar = {
  label: string;
  percent: number;
  tone: 'sand' | 'accent' | 'positive';
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
  periodNoun: string;
  currentTotal: number;
  previousTotal: number;
  /** Null for "new" / "no-change" — those render a label instead of a percentage. */
  changePct: number | null;
  changeKind: ChangeKind;
  deltaAmount: number;
  comparisonLabel: string;
  weeklyBars: WeeklyBar[];
  aiSummary: string;
  aiHighlights: AiHighlight[];
  movements: CategoryMovement[];
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function monthLabel(offset: number): string {
  const date = new Date();
  return MONTH_NAMES[(date.getMonth() + offset + 12) % 12];
}

export function insightsData(currencySymbol: string, period: InsightsPeriod = 'month'): InsightsData {
  const money = (value: number) => formatMoney(value, currencySymbol, {decimals: 0});

  if (period === 'week') {
    return {
      periodNoun: 'this week',
      currentTotal: 740,
      previousTotal: 806,
      changePct: -8,
      changeKind: 'decrease',
      deltaAmount: 66,
      comparisonLabel: 'than last week',
      weeklyBars: [
        {label: 'Mon', percent: 55, tone: 'sand'},
        {label: 'Wed', percent: 78, tone: 'accent'},
        {label: 'Fri', percent: 90, tone: 'accent'},
        {label: 'Sun', percent: 35, tone: 'positive'},
      ],
      aiSummary: `You're spending 8% less than last week — dining out dropped the most. Housing is still your biggest cost at 88% of expenses. At this pace you'll save about ${money(140)} more by week end.`,
      aiHighlights: [
        {id: '1', tone: 'positive', text: `Dining down ${money(45)} vs last week`},
        {id: '2', tone: 'warning', text: `Transport crept up ${money(20)} this week`},
      ],
      movements: [
        {id: 'dining', label: 'Dining', spent: 62, deltaPct: -22, changeKind: 'decrease'},
        {id: 'shopping', label: 'Shopping', spent: 21, deltaPct: -18, changeKind: 'decrease'},
        {id: 'groceries', label: 'Groceries', spent: 96, deltaPct: -4, changeKind: 'decrease'},
        {id: 'subscriptions', label: 'Subscriptions', spent: 60, deltaPct: 6, changeKind: 'increase'},
        {id: 'transport', label: 'Transport', spent: 41, deltaPct: 12, changeKind: 'increase'},
      ],
    };
  }

  if (period === 'year') {
    return {
      periodNoun: 'this year',
      currentTotal: 34120,
      previousTotal: 36300,
      changePct: -6,
      changeKind: 'decrease',
      deltaAmount: 2180,
      comparisonLabel: 'than last year',
      weeklyBars: [
        {label: 'Q1', percent: 62, tone: 'sand'},
        {label: 'Q2', percent: 95, tone: 'accent'},
        {label: 'Q3', percent: 58, tone: 'sand'},
        {label: 'Q4', percent: 44, tone: 'positive'},
      ],
      aiSummary: `You're spending 6% less than last year — mostly from cutting back on dining and shopping. Housing is still your biggest cost at 88% of expenses. At this pace you'll save about ${money(7400)} more by year end.`,
      aiHighlights: [
        {id: '1', tone: 'positive', text: `Dining down ${money(2100)} vs last year`},
        {id: '2', tone: 'warning', text: `Subscriptions crept up ${money(640)} this year`},
      ],
      movements: [
        {id: 'dining', label: 'Dining', spent: 3120, deltaPct: -18, changeKind: 'decrease'},
        {id: 'shopping', label: 'Shopping', spent: 1040, deltaPct: -31, changeKind: 'decrease'},
        {id: 'groceries', label: 'Groceries', spent: 4890, deltaPct: -6, changeKind: 'decrease'},
        {id: 'subscriptions', label: 'Subscriptions', spent: 2860, deltaPct: 14, changeKind: 'increase'},
        {id: 'transport', label: 'Transport', spent: 2110, deltaPct: 9, changeKind: 'increase'},
      ],
    };
  }

  return {
    periodNoun: 'this month',
    currentTotal: 2961,
    previousTotal: 3380,
    changePct: -12.4,
    changeKind: 'decrease',
    deltaAmount: 419,
    comparisonLabel: `than last month`,
    weeklyBars: [
      {label: 'W1', percent: 70, tone: 'sand'},
      {label: 'W2', percent: 95, tone: 'accent'},
      {label: 'W3', percent: 55, tone: 'sand'},
      {label: 'W4', percent: 40, tone: 'positive'},
    ],
    aiSummary: `You're spending 12% less than last month — mostly from cutting back on dining and shopping. Housing is still your biggest cost at 88% of expenses. At this pace you'll save about ${money(620)} more by month end.`,
    aiHighlights: [
      {id: '1', tone: 'positive', text: `Dining down ${money(180)} vs last month`},
      {id: '2', tone: 'warning', text: `Subscriptions crept up ${money(60)} this month`},
    ],
    movements: [
      {id: 'dining', label: 'Dining', spent: 266, deltaPct: -18, changeKind: 'decrease'},
      {id: 'shopping', label: 'Shopping', spent: 89, deltaPct: -31, changeKind: 'decrease'},
      {id: 'groceries', label: 'Groceries', spent: 412, deltaPct: -6, changeKind: 'decrease'},
      {id: 'subscriptions', label: 'Subscriptions', spent: 240, deltaPct: 14, changeKind: 'increase'},
      {id: 'transport', label: 'Transport', spent: 178, deltaPct: 9, changeKind: 'increase'},
    ],
  };
}

export function previousPeriodLabel(period: InsightsPeriod): string {
  if (period === 'week') return 'last week';
  if (period === 'year') return 'last year';
  return monthLabel(-1);
}
