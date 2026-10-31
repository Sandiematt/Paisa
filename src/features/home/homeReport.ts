import {colors} from '../../theme/colors';
import {cycleFor, getActivePayday, isCalendarCycle, previousCycle} from '../../lib/budgetCycle';
import {CategoryRow} from '../../lib/categoriesStore';
import {
  BillCommitment,
  PendingBill,
  billCommitments,
  committedTotals,
  isBillRow,
  monthlyBillTotal,
} from '../../lib/recurring';
import {
  TransactionRow,
  isBalanceAdjustment,
  isLedgerSpecial,
  isOpeningBalance,
  localDateISO,
  roundMoney,
} from '../../lib/transactionsStore';

export type HomeRange = 'week' | 'month';

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
  /** Payday; the budget "month" runs from it. Null keeps calendar months. */
  payday?: number | null;
  /** Bills picked at sign-up that are not in the ledger yet. */
  pendingBills?: PendingBill[];
};

/** How the last finished budget month ended for savings. */
export type MonthSavings = {
  /** "October", or "25 Sep – 24 Oct" with a payday. */
  label: string;
  /** Income that came in less everything spent, bills included; negative when spending ran over. */
  saved: number;
  /** The monthly savings goal it is judged against; 0 when none is set. */
  goal: number;
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
  /** Wallet balance at the start of the period (before its first day). */
  startBalance: number;
  /**
   * What income, spending and adjustments added or took this period. The
   * starting balance entered at sign-up is not a change, so it is left out.
   */
  balanceChange: number;
  /**
   * Day the change counts from, as `{day, monthIndex}` for "since 1 October":
   * the first day of the period, or the first ledger day when tracking started
   * inside it.
   */
  periodStart: {day: number; monthIndex: number};
  /** Tracking started inside this period, so there is nothing before it. */
  startedThisPeriod: boolean;
  changePct: number | null;
  changeAmount: number;
  income: number;
  spent: number;
  remainingBudget: number;
  /** The period's budget after the month's bills: what day-to-day spending gets. */
  budget: number;
  /** The period's spending with bill payments left out; `budget` is judged on it. */
  budgetSpent: number;
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
  monthlySavingsState: SavingsState;
  /** Monthly bills due this budget month, set aside before day-to-day spending. */
  monthlyCommitted: number;
  /** The part of monthlyCommitted not paid yet; remainingBudget already leaves it out. */
  monthlyUpcomingBills: number;
  /** Every monthly bill, including ones that start next cycle; the budget is shown after these. */
  monthlyBills: number;
  bills: BillCommitment[];
  /** The budget month before this one, once it was tracked and had income; null otherwise. */
  lastMonthSavings: MonthSavings | null;
  periodSavingsTarget: number;
  plannedSavings: number;
  periodPlannedSavings: number;
  actualSavings: number;
  savingsVsTarget: number;
  /** Savings the goal asks for from the period start (or tracking start) through today. */
  savingsTargetToDate: number;
  savingsState: SavingsState;
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

/** Built per call so its colour follows the active scheme. */
function emptySlice(): SpendSlice {
  return {
    id: 'empty',
    label: 'Nothing yet',
    color: colors.inkMuted,
    percent: 100,
  };
}

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

export function periodFor(
  range: HomeRange,
  now = new Date(),
  payday: number | null = getActivePayday(),
): Period {
  const today = startOfDay(now);

  if (range === 'week') {
    const start = startOfWeekMonday(today);
    const end = addDays(start, 6);
    const prevStart = addDays(start, -7);
    const prevEnd = addDays(start, -1);
    return {start, end, prevStart, prevEnd};
  }

  // The budget month: the calendar month, or payday to payday.
  const cycle = cycleFor(today, payday);
  const previous = previousCycle(today, payday);
  return {
    start: cycle.start,
    end: cycle.end,
    prevStart: previous.start,
    prevEnd: previous.end,
  };
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

/** Spending in the budget month containing `now`, ledger adjustments excluded. */
export function monthlySpentFor(
  transactions: TransactionRow[],
  now = new Date(),
  payday: number | null = getActivePayday(),
): number {
  const period = periodFor('month', now, payday);
  const rows = transactions.filter(row =>
    inRange(row.transactionDate, period.start, period.end),
  );
  return roundMoney(walletParts(rows).spent);
}

/**
 * Day-to-day spending in the budget month containing `now`: monthly bill
 * payments are left out, since the budget is judged after bills.
 */
export function dayToDaySpentFor(
  transactions: TransactionRow[],
  now = new Date(),
  payday: number | null = getActivePayday(),
): number {
  const period = periodFor('month', now, payday);
  const rows = transactions.filter(row =>
    inRange(row.transactionDate, period.start, period.end),
  );
  return roundMoney(walletParts(rows).spent - billSpend(rows));
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
      healthHint: 'Add your starting balance or a salary to start tracking',
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
      healthHint: 'Your tracked balance is used up. Log income to keep going',
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
      healthHint: 'Spending used up your tracked balance this period',
      healthTone: 'poor',
      savingsRate: 0,
      spendRatio,
    };
  }

  if (remainingPct >= 20) {
    return {
      health: remainingPct,
      healthLabel: 'Good',
      healthHint: `${remainingPct}% of your tracked balance is still left`,
      healthTone: 'good',
      savingsRate: remainingPct,
      spendRatio,
    };
  }

  return {
    health: remainingPct,
    healthLabel: 'Fair',
    healthHint: `Spending used ${spendRatio}% of your tracked balance this period`,
    healthTone: 'fair',
    savingsRate: remainingPct,
    spendRatio,
  };
}

/** A day's share of a monthly amount: the amount over the days of its budget month. */
export function budgetForDay(
  monthlyAmount: number,
  day: Date,
  payday: number | null = getActivePayday(),
): number {
  if (!Number.isFinite(monthlyAmount) || monthlyAmount <= 0) {
    return 0;
  }
  return monthlyAmount / cycleFor(day, payday).length;
}

export function budgetForSpan(
  monthlyAmount: number,
  start: Date,
  end: Date,
  payday: number | null = getActivePayday(),
): number {
  let total = 0;
  for (let day = startOfDay(start); day.getTime() <= end.getTime(); day = addDays(day, 1)) {
    total += budgetForDay(monthlyAmount, day, payday);
  }
  return roundMoney(total);
}

export function scaleMonthly(
  amount: number,
  range: HomeRange,
  now: Date,
  payday: number | null = getActivePayday(),
): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  const period = periodFor(range, now, payday);
  return budgetForSpan(amount, period.start, period.end, payday);
}

/**
 * The part of a monthly goal due from the start of the period (or
 * `trackingStart`, when later) through `now`, at goal / days-in-budget-month
 * a day.
 */
export function savingsDueBy(
  monthlyGoal: number,
  range: HomeRange,
  now: Date,
  trackingStart: Date | null = null,
  payday: number | null = getActivePayday(),
): number {
  if (!Number.isFinite(monthlyGoal) || monthlyGoal <= 0) {
    return 0;
  }
  const period = periodFor(range, now, payday);
  const today = startOfDay(now);
  const from =
    trackingStart && startOfDay(trackingStart) > period.start
      ? startOfDay(trackingStart)
      : period.start;
  const to = today < period.end ? today : period.end;
  return from > to ? 0 : budgetForSpan(monthlyGoal, from, to, payday);
}

/** Earliest ledger day, or null for an empty ledger. */
export function firstLedgerDay(transactions: TransactionRow[]): Date | null {
  let first: Date | null = null;
  for (const row of transactions) {
    const day = parseCalendarDate(row.transactionDate);
    if (!Number.isNaN(day.getTime()) && (first === null || day < first)) {
      first = day;
    }
  }
  return first;
}

export function yearlyFromMonthly(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return roundMoney(amount * 12);
}

export function rangeNoun(range: HomeRange): string {
  if (range === 'week') {
    return 'week';
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
    range === 'week' ? 'Weekly' : 'Monthly';
  return kind === 'budget' ? `${prefix} budget` : `${prefix} savings goal`;
}

export type SavingsState =
  | {kind: 'no-income'}
  | {kind: 'positive'; amount: number}
  | {kind: 'negative'; overspend: number};

function savingsStateFor(income: number, spent: number): SavingsState {
  if (income <= 0) return {kind: 'no-income'};
  const net = roundMoney(income - spent);
  return net >= 0
    ? {kind: 'positive', amount: net}
    : {kind: 'negative', overspend: roundMoney(-net)};
}

type PlanInsight = {
  remainingBudget: number;
  budget: number;
  budgetSpent: number;
  monthlyIncome: number;
  monthlyBudget: number;
  monthlySavingsGoal: number;
  periodSavingsTarget: number;
  savingsTargetToDate: number;
  plannedSavings: number;
  periodPlannedSavings: number;
  actualSavings: number;
  savingsVsTarget: number;
  savingsState: SavingsState;
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

const NO_BILLS = {committed: 0, spent: 0};

/** What rows spent on monthly bills, which come off the budget up front. */
function billSpend(rows: TransactionRow[]): number {
  return rows.reduce((sum, row) => (isBillRow(row) ? sum + row.amount : sum), 0);
}

function planInsight(
  plan: MoneyPlan,
  spent: number,
  actualIncome: number,
  range: HomeRange,
  now: Date,
  empty: boolean,
  trackingStart: Date | null = null,
  /** The budget month's bills, and how much of `spent` went on bills. */
  bills: {committed: number; spent: number} = NO_BILLS,
): PlanInsight {
  const payday = plan.payday ?? null;
  const monthlyIncome = roundMoney(Math.max(0, plan.monthlyIncome));
  const monthlyBudget = roundMoney(Math.max(0, plan.monthlyBudget));
  const monthlySavingsGoal = roundMoney(Math.max(0, plan.monthlySavingsGoal));
  // The budget is shown and judged after bills: they come off it up front,
  // and what is left is weighed against day-to-day spending, bills left out.
  const dayToDay = monthlyBudget - Math.max(0, bills.committed);
  const budgetSpent = roundMoney(Math.max(0, spent - Math.max(0, bills.spent)));
  const periodBudget = dayToDay > 0 ? scaleMonthly(dayToDay, range, now, payday) : 0;
  // Bills over the budget leave it short before anything is spent.
  const periodShortfall = dayToDay < 0 ? scaleMonthly(-dayToDay, range, now, payday) : 0;
  const periodPlannedIncome = scaleMonthly(monthlyIncome, range, now, payday);
  const periodSavingsTarget = scaleMonthly(monthlySavingsGoal, range, now, payday);
  const noun = rangeNoun(range);
  const remainingBudget = roundMoney(periodBudget - budgetSpent - periodShortfall);
  const overBudget = monthlyBudget > 0 && remainingBudget < -0.004;
  const plannedSavings = roundMoney(monthlyIncome - monthlyBudget);
  const periodPlannedSavings = roundMoney(
    periodPlannedIncome - scaleMonthly(monthlyBudget, range, now, payday),
  );
  const planFeasible =
    monthlySavingsGoal <= 0 || plannedSavings + 0.004 >= monthlySavingsGoal;
  const savingsState = savingsStateFor(actualIncome, spent);
  const actualSavings =
    savingsState.kind === 'positive'
      ? savingsState.amount
      : savingsState.kind === 'negative'
        ? -savingsState.overspend
        : 0;
  // Like the budget, the goal is spread over the days of the month, so the
  // period is judged on what is due by today, not on the whole period's goal
  // from its first day. Days before tracking started are not counted.
  const savingsTargetToDate = savingsDueBy(
    monthlySavingsGoal,
    range,
    now,
    trackingStart,
    payday,
  );
  const savingsVsTarget = roundMoney(actualSavings - savingsTargetToDate);
  const spendRatio =
    periodBudget > 0
      ? Math.round((budgetSpent / periodBudget) * 100)
      : overBudget
        ? 100
        : 0;

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
      budgetSpent,
      monthlyIncome,
      monthlyBudget,
      monthlySavingsGoal,
      periodSavingsTarget,
      savingsTargetToDate,
      plannedSavings,
      periodPlannedSavings,
      actualSavings,
      savingsVsTarget,
      savingsState,
      planFeasible,
      overBudget: false,
      health: 0,
      healthLabel: 'No data',
      healthHint: 'Add your starting balance or a salary to start tracking',
      healthTone: 'empty',
      insightKicker: 'Health score',
      planLabel: 'No data',
      planHint: 'Set a monthly budget and savings goal in your profile.',
      planTone: 'empty',
      savingsRate: 0,
      spendRatio: 0,
    };
  }

  if (monthlyBudget > 0 && overBudget) {
    return {
      remainingBudget,
      budget: periodBudget,
      budgetSpent,
      monthlyIncome,
      monthlyBudget,
      monthlySavingsGoal,
      periodSavingsTarget,
      savingsTargetToDate,
      plannedSavings,
      periodPlannedSavings,
      actualSavings,
      savingsVsTarget,
      savingsState,
      planFeasible,
      overBudget,
      health: 0,
      healthLabel: 'Off track',
      healthHint:
        dayToDay < 0
          ? 'Your monthly bills are more than your budget.'
          : `You've spent more than this ${noun}'s budget.`,
      healthTone: 'poor',
      insightKicker: 'Spending',
      planLabel,
      planHint,
      planTone,
      savingsRate: 0,
      spendRatio,
    };
  }

  if (monthlyBudget > 0) {
    return {
      remainingBudget,
      budget: periodBudget,
      budgetSpent,
      monthlyIncome,
      monthlyBudget,
      monthlySavingsGoal,
      periodSavingsTarget,
      savingsTargetToDate,
      plannedSavings,
      periodPlannedSavings,
      actualSavings,
      savingsVsTarget,
      savingsState,
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
    budgetSpent,
    monthlyIncome,
    monthlyBudget,
    monthlySavingsGoal,
    periodSavingsTarget,
    savingsTargetToDate,
    plannedSavings,
    periodPlannedSavings,
    actualSavings,
    savingsVsTarget,
    savingsState,
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
  return Math.max(0, Math.round((date.getTime() - periodStart.getTime()) / 86400000));
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
  if (today.getTime() < period.start.getTime()) {
    return 1;
  }
  const last = today.getTime() > period.end.getTime() ? period.end : today;
  return Math.round((last.getTime() - period.start.getTime()) / 86400000) + 1;
}

/**
 * Running wallet balance per day of the period, up to today. When tracking
 * started inside the period the line starts that day, and the starting
 * balance is its baseline rather than a jump up from zero: days before the
 * account existed have no balance to draw.
 */
function walletSeries(
  range: HomeRange,
  period: Period,
  transactions: TransactionRow[],
  now: Date,
  trackingStart: Date | null = null,
): number[] {
  const prior = walletParts(
    transactions.filter(row => compareDate(row.transactionDate, period.start, false)),
  );
  const count = seriesPointCount(range, period, now);
  const startedInside =
    trackingStart !== null && trackingStart.getTime() > period.start.getTime();
  const first = startedInside
    ? Math.min(count - 1, bucketIndex(range, localDateISO(trackingStart), period.start))
    : 0;
  const buckets = Array.from({length: count}, () => 0);
  let running = prior.balance;
  for (const row of transactions) {
    if (!inRange(row.transactionDate, period.start, period.end)) {
      continue;
    }
    if (startedInside && isOpeningBalance(row)) {
      running += row.amount;
      continue;
    }
    const index = bucketIndex(range, row.transactionDate, period.start);
    if (index < 0 || index >= count) {
      continue;
    }
    buckets[index] += row.type === 'income' ? row.amount : -row.amount;
  }
  return buckets.slice(first).map(value => {
    running += value;
    return Number(running.toFixed(2));
  });
}

function highlightStamp(range: HomeRange, index: number, periodStart: Date): string {
  if (range === 'week') {
    return WEEK_LABELS[index]?.toUpperCase() ?? '';
  }
  return String(addDays(periodStart, index).getDate());
}

function shortDay(date: Date): string {
  return `${date.getDate()} ${date.toLocaleDateString('en-US', {month: 'short'})}`;
}

/**
 * Savings for the finished budget month before `monthPeriod`: what came in
 * less what went out, so income above the plan counts as saved. Null when
 * tracking started after it ended or no income was recorded in it.
 */
function lastMonthSavings(
  transactions: TransactionRow[],
  monthPeriod: Period,
  payday: number | null,
  plan: MoneyPlan,
  trackingStart: Date | null,
): MonthSavings | null {
  const {prevStart, prevEnd} = monthPeriod;
  if (trackingStart === null || trackingStart > prevEnd) {
    return null;
  }
  const parts = walletParts(
    transactions.filter(row => inRange(row.transactionDate, prevStart, prevEnd)),
  );
  if (parts.income <= 0) {
    return null;
  }
  return {
    label: isCalendarCycle(payday)
      ? prevStart.toLocaleDateString('en-US', {month: 'long'})
      : `${shortDay(prevStart)} – ${shortDay(prevEnd)}`,
    saved: parts.net,
    goal: roundMoney(Math.max(0, plan.monthlySavingsGoal)),
  };
}

function rangeLabel(range: HomeRange, now: Date, period: Period, payday: number | null): string {
  if (range === 'week') {
    return 'THIS WEEK';
  }
  if (!isCalendarCycle(payday)) {
    return `${shortDay(period.start)} – ${shortDay(period.end)}`.toUpperCase();
  }
  return now.toLocaleDateString('en-US', {month: 'long'}).toUpperCase();
}

function compareLabel(range: HomeRange, now: Date, payday: number | null): string {
  if (range === 'week') {
    return 'vs last week';
  }
  if (!isCalendarCycle(payday)) {
    return 'vs last pay cycle';
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
    return [emptySlice()];
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
  const payday = plan.payday ?? null;
  const period = periodFor(range, now, payday);
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
  const previousStartBalance = walletParts(
    transactions.filter(row => compareDate(row.transactionDate, period.prevStart, false)),
  ).balance;
  const previousRemaining = walletParts(
    transactions.filter(row =>
      compareDate(row.transactionDate, period.prevEnd, true),
    ),
  ).balance;
  const empty = transactions.length === 0;
  const trackingStart = firstLedgerDay(transactions);
  const startedThisPeriod =
    trackingStart !== null && trackingStart > period.start;
  const changeFrom = startedThisPeriod && trackingStart ? trackingStart : period.start;
  const change = rangeChange(
    current.net,
    previous.net,
    lifetime.balance,
    startBalance,
    empty,
  );
  const series = walletSeries(range, period, transactions, now, trackingStart);
  const highlightIndex = Math.max(0, series.length - 1);
  const highlightValue = series[highlightIndex] ?? lifetime.balance;
  const periodEmpty = currentRows.length === 0;
  const monthPeriod = range === 'month' ? period : periodFor('month', now, payday);
  const bills = billCommitments(
    transactions,
    {start: localDateISO(monthPeriod.start), end: localDateISO(monthPeriod.end)},
    plan.pendingBills,
  );
  const billTotals = committedTotals(bills);
  const monthRows =
    range === 'month'
      ? currentRows
      : transactions.filter(row =>
          inRange(row.transactionDate, monthPeriod.start, monthPeriod.end),
        );
  const monthParts = range === 'month' ? current : walletParts(monthRows);
  const hasBudget = plan.monthlyBudget > 0;
  const hasPlan = hasBudget || plan.monthlySavingsGoal > 0;
  // The month's bills come off the budget up front, for every range: a
  // week's or day's budget is its share of what the bills leave.
  const incomeInsight = planInsight(
    plan,
    current.spent,
    current.income,
    range,
    now,
    empty,
    trackingStart,
    {committed: billTotals.committed, spent: billSpend(currentRows)},
  );
  // Savings with a budget are the goal plus extra savings, from the rolling
  // budget (src/lib/budgetEngine.ts); the report keeps income less spending.
  const insight = incomeInsight;
  const monthIncomeInsight =
    range === 'month'
      ? incomeInsight
      : planInsight(
          plan,
          monthParts.spent,
          monthParts.income,
          'month',
          now,
          empty,
          trackingStart,
          {committed: billTotals.committed, spent: billSpend(monthRows)},
        );
  const monthInsight = range === 'month' ? insight : monthIncomeInsight;
  const monthSlices =
    range === 'month' ? spendSlices(currentRows, categories) : spendSlices(monthRows, categories);
  const health = hasBudget
    ? insight
    : healthBreakdown(
        roundMoney(
          startBalance + current.opening + current.adjustments + current.income - current.spent,
        ),
        current.spent,
        empty,
      );
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
    trackingStart,
    // Judged against this month's bills, so the health change compares like with like.
    {committed: billTotals.committed, spent: billSpend(previousRows)},
  );
  const previousHealth = hasBudget
    ? previousInsight
    : healthBreakdown(
        roundMoney(
          previousStartBalance + previous.opening + previous.adjustments + previous.income - previous.spent,
        ),
        previous.spent,
        previousRows.length === 0 && previousRemaining === 0,
      );

  return {
    range,
    rangeLabel: rangeLabel(range, now, period, payday),
    compareLabel: compareLabel(range, now, payday),
    net: current.net,
    balance: lifetime.balance,
    startBalance,
    balanceChange: roundMoney(lifetime.balance - startBalance - current.opening),
    periodStart: {
      day: changeFrom.getDate(),
      monthIndex: changeFrom.getMonth(),
    },
    startedThisPeriod,
    changePct: change.changePct,
    changeAmount: change.changeAmount,
    income: roundMoney(current.income),
    spent: roundMoney(current.spent),
    remainingBudget: insight.remainingBudget,
    budget: insight.budget,
    budgetSpent: insight.budgetSpent,
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
    monthlySavingsState: monthInsight.savingsState,
    monthlyCommitted: billTotals.committed,
    monthlyUpcomingBills: billTotals.upcoming,
    monthlyBills: monthlyBillTotal(bills),
    bills,
    lastMonthSavings: lastMonthSavings(transactions, monthPeriod, payday, plan, trackingStart),
    periodSavingsTarget: insight.periodSavingsTarget,
    plannedSavings: insight.plannedSavings,
    periodPlannedSavings: insight.periodPlannedSavings,
    actualSavings: insight.actualSavings,
    savingsVsTarget: insight.savingsVsTarget,
    savingsTargetToDate: insight.savingsTargetToDate,
    savingsState: insight.savingsState,
    planFeasible: insight.planFeasible,
    overBudget: insight.overBudget,
    series,
    highlightIndex,
    highlightValue,
    // The series may start part way into the period, on the first ledger day.
    highlightStamp: highlightStamp(
      range,
      highlightIndex + seriesPointCount(range, period, now) - series.length,
      period.start,
    ),
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
    spendRatio: hasBudget ? insight.spendRatio : health.spendRatio,
    empty,
    periodEmpty,
  };
}

/** "Saved ₹2,400 against a ₹2,000 goal", or how far short or over it ended. */
export function lastMonthLine(
  month: MonthSavings,
  money: (amount: number) => string,
): string {
  if (month.saved < 0) {
    return `Spent ${money(-month.saved)} more than came in`;
  }
  if (month.goal <= 0) {
    return `Saved ${money(month.saved)}`;
  }
  return month.saved >= month.goal
    ? `Saved ${money(month.saved)} against a ${money(month.goal)} goal`
    : `Saved ${money(month.saved)}, ${money(month.goal - month.saved)} short of the ${money(month.goal)} goal`;
}
