import {colors} from '../../theme/colors';
import {CategoryRow} from '../../lib/categoriesStore';
import {
  TransactionRow,
  isBalanceAdjustment,
  isLedgerSpecial,
  isOpeningBalance,
  roundMoney,
} from '../../lib/transactionsStore';

export type HomeRange = 'week' | 'month' | 'year';

export type SpendSlice = {
  id: string;
  label: string;
  color: string;
  percent: number;
};

export type HealthTone = 'good' | 'fair' | 'poor' | 'empty';

export type MoneyPlan = {
  monthlyIncome: number;
  monthlyBudget: number;
  monthlySavingsGoal: number;
};

export const EMPTY_MONEY_PLAN: MoneyPlan = {
  monthlyIncome: 0,
  monthlyBudget: 0,
  monthlySavingsGoal: 0,
};

export type InsightKicker = 'Budget plan' | 'Spending' | 'Health score';

export type HomeReport = {
  range: HomeRange;
  rangeLabel: string;
  compareLabel: string;
  net: number;
  balance: number;
  changePct: number | null;
  changeAmount: number;
  income: number;
  spent: number;
  remainingBudget: number;
  budget: number;
  monthlyIncome: number;
  monthlyBudget: number;
  monthlySpent: number;
  monthlyRemainingBudget: number;
  monthlySpendRatio: number;
  monthlyOverBudget: boolean;
  monthlySlices: SpendSlice[];
  monthlySavingsGoal: number;
  monthlyActualSavings: number;
  monthlySavingsVsTarget: number;
  monthlySavingsUsesPlannedIncome: boolean;
  periodSavingsTarget: number;
  plannedSavings: number;
  periodPlannedSavings: number;
  actualSavings: number;
  savingsVsTarget: number;
  savingsUsesPlannedIncome: boolean;
  planFeasible: boolean;
  overBudget: boolean;
  series: number[];
  highlightIndex: number;
  highlightValue: number;
  highlightStamp: string;
  slices: SpendSlice[];
  health: number;
  healthLabel: string;
  healthHint: string;
  healthTone: HealthTone;
  healthDelta: number;
  insightKicker: InsightKicker;
  planLabel: string;
  planHint: string;
  planTone: HealthTone;
  savingsRate: number;
  spendRatio: number;
  empty: boolean;
  periodEmpty: boolean;
};

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTH_ABBREVS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const EMPTY_SLICE: SpendSlice = {
  id: 'empty',
  label: 'Nothing yet',
  color: colors.inkMuted,
  percent: 100,
};

type Period = {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
};

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const next = startOfDay(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function startOfWeekMonday(date: Date): Date {
  const start = startOfDay(date);
  const weekday = start.getDay();
  const offset = weekday === 0 ? 6 : weekday - 1;
  return addDays(start, -offset);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function periodFor(range: HomeRange, now = new Date()): Period {
  const today = startOfDay(now);

  if (range === 'week') {
    const start = startOfWeekMonday(today);
    const end = addDays(start, 6);
    const prevStart = addDays(start, -7);
    const prevEnd = addDays(start, -1);
    return {start, end, prevStart, prevEnd};
  }

  if (range === 'year') {
    const start = new Date(today.getFullYear(), 0, 1);
    const end = new Date(today.getFullYear(), 11, 31);
    const prevStart = new Date(today.getFullYear() - 1, 0, 1);
    const prevEnd = new Date(today.getFullYear() - 1, 11, 31);
    return {start, end, prevStart, prevEnd};
  }

  const start = new Date(today.getFullYear(), today.getMonth(), 1);
  const end = new Date(
    today.getFullYear(),
    today.getMonth(),
    daysInMonth(today.getFullYear(), today.getMonth()),
  );
  const prevStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const prevEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  return {start, end, prevStart, prevEnd};
}

/** Calendar day from `YYYY-MM-DD` or a full ISO timestamp. */
export function parseCalendarDate(isoDate: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate.trim());
  if (match) {
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  }
  const fallback = new Date(isoDate);
  if (Number.isNaN(fallback.getTime())) {
    return new Date(NaN);
  }
  return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
}

function inRange(isoDate: string, start: Date, end: Date): boolean {
  const value = parseCalendarDate(isoDate).getTime();
  if (Number.isNaN(value)) {
    return false;
  }
  return value >= start.getTime() && value <= end.getTime();
}

function walletParts(rows: TransactionRow[]) {
  let opening = 0;
  let adjustments = 0;
  let income = 0;
  let spent = 0;
  for (const row of rows) {
    const signed = row.type === 'income' ? row.amount : -row.amount;
    if (isOpeningBalance(row)) {
      opening += row.amount;
    } else if (isBalanceAdjustment(row)) {
      adjustments += signed;
    } else if (row.type === 'income') {
      income += row.amount;
    } else {
      spent += row.amount;
    }
  }
  return {
    opening,
    adjustments,
    income,
    spent,
    balance: roundMoney(opening + adjustments + income - spent),
    net: roundMoney(income - spent),
  };
}

function changePercent(current: number, previous: number): number | null {
  if (Math.abs(previous) < 0.005) {
    return Math.abs(current) < 0.005 ? 0 : null;
  }
  return Math.round(((current - previous) / Math.abs(previous)) * 100);
}

function rangeChange(
  currentNet: number,
  previousNet: number,
  currentBalance: number,
  startBalance: number,
  empty: boolean,
): {changePct: number | null; changeAmount: number} {
  const amount = roundMoney(currentNet - previousNet);
  if (empty) {
    return {changePct: null, changeAmount: amount};
  }
  const vsPrevious = changePercent(currentNet, previousNet);
  if (vsPrevious != null) {
    return {changePct: vsPrevious, changeAmount: amount};
  }
  return {
    changePct: changePercent(currentBalance, startBalance) ?? 0,
    changeAmount: amount,
  };
}

function compareDate(isoDate: string, edge: Date, inclusive: boolean): boolean {
  const value = parseCalendarDate(isoDate).getTime();
  if (Number.isNaN(value)) {
    return false;
  }
  return inclusive ? value <= edge.getTime() : value < edge.getTime();
}

function healthBreakdown(
  balance: number,
  spent: number,
  empty: boolean,
): {
  health: number;
  healthLabel: string;
  healthHint: string;
  healthTone: HealthTone;
  savingsRate: number;
  spendRatio: number;
} {
  if (empty) {
    return {
      health: 0,
      healthLabel: 'No data',
      healthHint: 'Add starting money or a salary to open your wallet',
      healthTone: 'empty',
      savingsRate: 0,
      spendRatio: 0,
    };
  }

  const available = balance + spent;
  if (available <= 0) {
    return {
      health: 0,
      healthLabel: 'Poor',
      healthHint: 'The wallet is empty. Add income to keep going',
      healthTone: 'poor',
      savingsRate: 0,
      spendRatio: 100,
    };
  }

  const remainingPct = Math.max(0, Math.min(100, Math.round((balance / available) * 100)));
  const spendRatio = Math.max(0, Math.min(100, Math.round((spent / available) * 100)));

  if (balance <= 0) {
    return {
      health: 0,
      healthLabel: 'Poor',
      healthHint: 'Spending used up the wallet this period',
      healthTone: 'poor',
      savingsRate: 0,
      spendRatio,
    };
  }

  if (remainingPct >= 20) {
    return {
      health: remainingPct,
      healthLabel: 'Good',
      healthHint: `${remainingPct}% of your wallet is still left`,
      healthTone: 'good',
      savingsRate: remainingPct,
      spendRatio,
    };
  }

  return {
    health: remainingPct,
    healthLabel: 'Fair',
    healthHint: `Spending used ${spendRatio}% of the wallet this period`,
    healthTone: 'fair',
    savingsRate: remainingPct,
    spendRatio,
  };
}

export function scaleMonthly(
  amount: number,
  range: HomeRange,
  now: Date,
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  if (range === 'week') {
    const days = daysInMonth(now.getFullYear(), now.getMonth());
    return roundMoney(amount * (7 / Math.max(days, 1)));
  }
  if (range === 'year') {
    return roundMoney(amount * 12);
  }
  return roundMoney(amount);
}

export function rangeNoun(range: HomeRange): string {
  if (range === 'week') {
    return 'week';
  }
  if (range === 'year') {
    return 'year';
  }
  return 'month';
}

export function rangeScopeLabel(range: HomeRange): string {
  return `this ${rangeNoun(range)}`;
}

export function rangePlanTitle(
  range: HomeRange,
  kind: 'budget' | 'savings',
): string {
  const prefix =
    range === 'week' ? 'Weekly' : range === 'year' ? 'Yearly' : 'Monthly';
  return kind === 'budget' ? `${prefix} budget` : `${prefix} savings goal`;
}

type PlanInsight = {
  remainingBudget: number;
  budget: number;
  monthlyIncome: number;
  monthlyBudget: number;
  monthlySavingsGoal: number;
  periodSavingsTarget: number;
  plannedSavings: number;
  periodPlannedSavings: number;
  actualSavings: number;
  savingsVsTarget: number;
  savingsUsesPlannedIncome: boolean;
  planFeasible: boolean;
  overBudget: boolean;
  health: number;
  healthLabel: string;
  healthHint: string;
  healthTone: HealthTone;
  insightKicker: InsightKicker;
  planLabel: string;
  planHint: string;
  planTone: HealthTone;
  savingsRate: number;
  spendRatio: number;
};

function planInsight(
  plan: MoneyPlan,
  spent: number,
  actualIncome: number,
  range: HomeRange,
  now: Date,
  empty: boolean,
): PlanInsight {
  const monthlyIncome = roundMoney(Math.max(0, plan.monthlyIncome));
  const monthlyBudget = roundMoney(Math.max(0, plan.monthlyBudget));
  const monthlySavingsGoal = roundMoney(Math.max(0, plan.monthlySavingsGoal));
  const periodBudget = scaleMonthly(monthlyBudget, range, now);
  const periodPlannedIncome = scaleMonthly(monthlyIncome, range, now);
  const periodSavingsTarget = scaleMonthly(monthlySavingsGoal, range, now);
  const noun = rangeNoun(range);
  const remainingBudget = roundMoney(periodBudget - spent);
  const overBudget = periodBudget > 0 && spent > periodBudget + 0.004;
  const plannedSavings = roundMoney(monthlyIncome - monthlyBudget);
  const periodPlannedSavings = roundMoney(periodPlannedIncome - periodBudget);
  const planFeasible =
    monthlySavingsGoal <= 0 || plannedSavings + 0.004 >= monthlySavingsGoal;
  const savingsUsesPlannedIncome =
    actualIncome <= 0 && periodPlannedIncome > 0;
  const incomeForSavings = savingsUsesPlannedIncome
    ? periodPlannedIncome
    : actualIncome;
  const actualSavings = roundMoney(incomeForSavings - spent);
  const savingsVsTarget = roundMoney(actualSavings - periodSavingsTarget);
  const spendRatio =
    periodBudget > 0 ? Math.round((spent / periodBudget) * 100) : 0;

  const planLabel = monthlySavingsGoal > 0 && !planFeasible ? 'Off track' : 'On track';
  const planTone: HealthTone =
    monthlySavingsGoal > 0 && !planFeasible ? 'poor' : 'good';
  const planHint =
    monthlySavingsGoal > 0 && !planFeasible
      ? `Income minus budget leaves less than the ${noun}'s savings target.`
      : monthlySavingsGoal > 0
        ? `Income minus budget covers the ${noun}'s savings target.`
        : monthlyBudget > 0
          ? `Income minus budget leaves ${Math.max(0, Math.round(periodPlannedSavings))} this ${noun}.`
          : 'Set a monthly budget and savings goal in your profile.';

  if (empty && monthlyIncome <= 0 && monthlyBudget <= 0 && monthlySavingsGoal <= 0) {
    return {
      remainingBudget,
      budget: periodBudget,
      monthlyIncome,
      monthlyBudget,
      monthlySavingsGoal,
      periodSavingsTarget,
      plannedSavings,
      periodPlannedSavings,
      actualSavings,
      savingsVsTarget,
      savingsUsesPlannedIncome,
      planFeasible,
      overBudget: false,
      health: 0,
      healthLabel: 'No data',
      healthHint: 'Add starting money or a salary to open your wallet',
      healthTone: 'empty',
      insightKicker: 'Health score',
      planLabel: 'No data',
      planHint: 'Set a monthly budget and savings goal in your profile.',
      planTone: 'empty',
      savingsRate: 0,
      spendRatio: 0,
    };
  }

  if (periodBudget > 0 && overBudget) {
    return {
      remainingBudget,
      budget: periodBudget,
      monthlyIncome,
      monthlyBudget,
      monthlySavingsGoal,
      periodSavingsTarget,
      plannedSavings,
      periodPlannedSavings,
      actualSavings,
      savingsVsTarget,
      savingsUsesPlannedIncome,
      planFeasible,
      overBudget,
      health: 0,
      healthLabel: 'Off track',
      healthHint: `You've spent more than this ${noun}'s budget.`,
      healthTone: 'poor',
      insightKicker: 'Spending',
      planLabel,
      planHint,
      planTone,
      savingsRate: 0,
      spendRatio,
    };
  }

  if (periodBudget > 0) {
    return {
      remainingBudget,
      budget: periodBudget,
      monthlyIncome,
      monthlyBudget,
      monthlySavingsGoal,
      periodSavingsTarget,
      plannedSavings,
      periodPlannedSavings,
      actualSavings,
      savingsVsTarget,
      savingsUsesPlannedIncome,
      planFeasible,
      overBudget,
      health: Math.max(0, Math.min(100, 100 - spendRatio)),
      healthLabel: 'On track',
      healthHint: `Spending is within this ${noun}'s budget.`,
      healthTone: 'good',
      insightKicker: 'Spending',
      planLabel,
      planHint,
      planTone,
      savingsRate: 0,
      spendRatio,
    };
  }

  return {
    remainingBudget,
    budget: periodBudget,
    monthlyIncome,
    monthlyBudget,
    monthlySavingsGoal,
    periodSavingsTarget,
    plannedSavings,
    periodPlannedSavings,
    actualSavings,
    savingsVsTarget,
    savingsUsesPlannedIncome,
    planFeasible,
    overBudget,
    health: planTone === 'poor' ? 35 : 100,
    healthLabel: planLabel,
    healthHint: planHint,
    healthTone: planTone,
    insightKicker: 'Budget plan',
    planLabel,
    planHint,
    planTone,
    savingsRate: 0,
    spendRatio,
  };
}

function bucketIndex(
  range: HomeRange,
  isoDate: string,
  periodStart: Date,
): number {
  const date = parseCalendarDate(isoDate);
  if (range === 'week') {
    return Math.max(
      0,
      Math.min(6, Math.round((date.getTime() - periodStart.getTime()) / 86400000)),
    );
  }
  if (range === 'year') {
    return date.getMonth();
  }
  return Math.max(0, date.getDate() - 1);
}

function seriesPointCount(
  range: HomeRange,
  period: Period,
  now: Date,
): number {
  const today = startOfDay(now);
  if (range === 'week') {
    const last =
      today.getTime() < period.end.getTime() ? today : period.end;
    return Math.max(
      1,
      Math.round((last.getTime() - period.start.getTime()) / 86400000) + 1,
    );
  }
  if (range === 'year') {
    if (today.getFullYear() !== period.start.getFullYear()) {
      return 12;
    }
    return today.getMonth() + 1;
  }
  if (today.getTime() < period.start.getTime()) {
    return 1;
  }
  if (today.getTime() > period.end.getTime()) {
    return daysInMonth(period.start.getFullYear(), period.start.getMonth());
  }
  return today.getDate();
}

function walletSeries(
  range: HomeRange,
  period: Period,
  transactions: TransactionRow[],
  now: Date,
): number[] {
  const prior = walletParts(
    transactions.filter(row => compareDate(row.transactionDate, period.start, false)),
  );
  const count = seriesPointCount(range, period, now);
  const buckets = Array.from({length: count}, () => 0);
  for (const row of transactions) {
    if (!inRange(row.transactionDate, period.start, period.end)) {
      continue;
    }
    const index = bucketIndex(range, row.transactionDate, period.start);
    if (index < 0 || index >= count) {
      continue;
    }
    buckets[index] += row.type === 'income' ? row.amount : -row.amount;
  }
  let running = prior.balance;
  return buckets.map(value => {
    running += value;
    return Number(running.toFixed(2));
  });
}

function highlightStamp(range: HomeRange, index: number): string {
  if (range === 'week') {
    return WEEK_LABELS[index]?.toUpperCase() ?? '';
  }
  if (range === 'year') {
    return MONTH_ABBREVS[index]?.toUpperCase() ?? '';
  }
  return String(index + 1);
}

function rangeLabel(range: HomeRange, now: Date): string {
  if (range === 'week') {
    return 'THIS WEEK';
  }
  if (range === 'year') {
    return String(now.getFullYear());
  }
  return now.toLocaleDateString('en-US', {month: 'long'}).toUpperCase();
}

function compareLabel(range: HomeRange, now: Date): string {
  if (range === 'week') {
    return 'vs last week';
  }
  if (range === 'year') {
    return 'vs last year';
  }
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `vs ${previous.toLocaleDateString('en-US', {month: 'long'})}`;
}

function spendSlices(
  rows: TransactionRow[],
  categories: CategoryRow[],
): SpendSlice[] {
  const spentRows = rows.filter(
    row => row.type === 'expense' && row.amount > 0 && !isLedgerSpecial(row),
  );
  if (spentRows.length === 0) {
    return [EMPTY_SLICE];
  }

  const byCategory = new Map<string, number>();
  for (const row of spentRows) {
    const key = row.categoryId ?? 'uncategorized';
    byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount);
  }

  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked.slice(0, 4);
  const rest = ranked.slice(4);
  const restTotal = rest.reduce((sum, [, amount]) => sum + amount, 0);

  const parts: {id: string; label: string; color: string; amount: number}[] =
    top.map(([id, amount]) => {
      const category = categories.find(item => item.id === id);
      return {
        id,
        label: category?.name ?? 'Uncategorized',
        color: category?.color ?? colors.inkMuted,
        amount,
      };
    });

  if (restTotal > 0) {
    parts.push({
      id: 'other',
      label: 'Everything else',
      color: colors.inkMuted,
      amount: restTotal,
    });
  }

  const total = parts.reduce((sum, part) => sum + part.amount, 0);
  const percents = parts.map(part => Math.round((part.amount / total) * 100));
  const drift = 100 - percents.reduce((sum, value) => sum + value, 0);
  percents[percents.length - 1] += drift;

  return parts.map((part, index) => ({
    id: part.id,
    label: part.label,
    color: part.color,
    percent: Math.max(0, percents[index]),
  }));
}

export function buildHomeReport(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  range: HomeRange,
  now = new Date(),
  plan: MoneyPlan = EMPTY_MONEY_PLAN,
): HomeReport {
  const period = periodFor(range, now);
  const currentRows = transactions.filter(row =>
    inRange(row.transactionDate, period.start, period.end),
  );
  const previousRows = transactions.filter(row =>
    inRange(row.transactionDate, period.prevStart, period.prevEnd),
  );

  const current = walletParts(currentRows);
  const previous = walletParts(previousRows);
  const lifetime = walletParts(transactions);
  const startBalance = walletParts(
    transactions.filter(row => compareDate(row.transactionDate, period.start, false)),
  ).balance;
  const previousRemaining = walletParts(
    transactions.filter(row =>
      compareDate(row.transactionDate, period.prevEnd, true),
    ),
  ).balance;
  const empty = transactions.length === 0;
  const change = rangeChange(
    current.net,
    previous.net,
    lifetime.balance,
    startBalance,
    empty,
  );
  const series = walletSeries(range, period, transactions, now);
  const highlightIndex = Math.max(0, series.length - 1);
  const highlightValue = series[highlightIndex] ?? lifetime.balance;
  const periodEmpty = currentRows.length === 0;
  const monthPeriod = range === 'month' ? period : periodFor('month', now);
  const monthRows =
    range === 'month'
      ? currentRows
      : transactions.filter(row =>
          inRange(row.transactionDate, monthPeriod.start, monthPeriod.end),
        );
  const monthParts = range === 'month' ? current : walletParts(monthRows);
  const hasPlan = plan.monthlyBudget > 0 || plan.monthlySavingsGoal > 0;
  const insight = planInsight(
    plan,
    current.spent,
    current.income,
    range,
    now,
    empty,
  );
  const monthInsight =
    range === 'month'
      ? insight
      : planInsight(plan, monthParts.spent, monthParts.income, 'month', now, empty);
  const monthSlices =
    range === 'month' ? spendSlices(currentRows, categories) : spendSlices(monthRows, categories);
  const health = hasPlan
    ? insight
    : healthBreakdown(lifetime.balance, current.spent, empty);
  const previousInsight = planInsight(
    plan,
    previous.spent,
    previous.income,
    range,
    new Date(
      period.prevEnd.getFullYear(),
      period.prevEnd.getMonth(),
      period.prevEnd.getDate(),
    ),
    previousRows.length === 0,
  );
  const previousHealth = hasPlan
    ? previousInsight
    : healthBreakdown(
        previousRemaining,
        previous.spent,
        previousRows.length === 0 && previousRemaining === 0,
      );

  return {
    range,
    rangeLabel: rangeLabel(range, now),
    compareLabel: compareLabel(range, now),
    net: current.net,
    balance: lifetime.balance,
    changePct: change.changePct,
    changeAmount: change.changeAmount,
    income: roundMoney(current.income),
    spent: roundMoney(current.spent),
    remainingBudget: insight.remainingBudget,
    budget: insight.budget,
    monthlyIncome: insight.monthlyIncome,
    monthlyBudget: insight.monthlyBudget,
    monthlySpent: roundMoney(monthParts.spent),
    monthlyRemainingBudget: monthInsight.remainingBudget,
    monthlySpendRatio: monthInsight.spendRatio,
    monthlyOverBudget: monthInsight.overBudget,
    monthlySlices: monthSlices,
    monthlySavingsGoal: insight.monthlySavingsGoal,
    monthlyActualSavings: monthInsight.actualSavings,
    monthlySavingsVsTarget: monthInsight.savingsVsTarget,
    monthlySavingsUsesPlannedIncome: monthInsight.savingsUsesPlannedIncome,
    periodSavingsTarget: insight.periodSavingsTarget,
    plannedSavings: insight.plannedSavings,
    periodPlannedSavings: insight.periodPlannedSavings,
    actualSavings: insight.actualSavings,
    savingsVsTarget: insight.savingsVsTarget,
    savingsUsesPlannedIncome: insight.savingsUsesPlannedIncome,
    planFeasible: insight.planFeasible,
    overBudget: insight.overBudget,
    series,
    highlightIndex,
    highlightValue,
    highlightStamp: highlightStamp(range, highlightIndex),
    slices: spendSlices(currentRows, categories),
    health: health.health,
    healthLabel: health.healthLabel,
    healthHint: health.healthHint,
    healthTone: health.healthTone,
    healthDelta: health.health - previousHealth.health,
    insightKicker: hasPlan ? insight.insightKicker : 'Health score',
    planLabel: hasPlan ? insight.planLabel : health.healthLabel,
    planHint: hasPlan ? insight.planHint : health.healthHint,
    planTone: hasPlan ? insight.planTone : health.healthTone,
    savingsRate: health.savingsRate,
    spendRatio: hasPlan ? insight.spendRatio : health.spendRatio,
    empty,
    periodEmpty,
  };
}
