import {MonthState, validatePlan} from '../../lib/budgetEngine';
import {formatMoney} from '../../lib/formatMoney';

/**
 * How the rolling budget reads on the dashboard. Paisa only tracks money the
 * user keeps in their bank, so the words are "tracked", "saved" and "left to
 * spend", never a balance Paisa holds.
 */

/**
 * A limit as shown, rounded down to the rupee: never more than the spend
 * guard allows (it works to the paisa).
 */
export function shownLimit(limit: number): number {
  return Math.max(0, Math.floor(limit + 1e-9));
}

/**
 * What "you can spend today" shows: today's limit, or nothing once today's
 * spending has gone past it. The overspend still comes off the days after.
 */
export function spendableToday(limit: number, leftToday: number): number {
  return leftToday < 0 ? 0 : shownLimit(limit);
}

/** "1 Nov", from `YYYY-MM-DD`. */
export function dayMonth(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
  });
}

export function daysLeftLabel(days: number): string {
  if (days <= 0) {
    return 'month ended';
  }
  return days === 1 ? 'last day' : `${days} days left`;
}

export type BudgetLine = {text: string; tone: 'normal' | 'over' | 'notice'};

/** The one-line summary under the balance. */
export function budgetStripLine(
  state: MonthState,
  range: 'week' | 'month',
  money: (amount: number) => string,
): BudgetLine {
  if (state.kind === 'waiting' && state.startsOn) {
    return {text: `Your budget starts on ${dayMonth(state.startsOn)}`, tone: 'notice'};
  }
  if (state.kind === 'invalid') {
    return {text: 'Bills and savings are more than your budget', tone: 'over'};
  }
  if (state.overspent) {
    return {
      text: `Overspent by ${money(state.overspentBy)} · ${daysLeftLabel(state.remainingDays)}`,
      tone: 'over',
    };
  }
  if (state.zeroSpendable) {
    return {text: 'Bills and savings use the whole budget', tone: 'notice'};
  }
  if (range === 'week') {
    const left = state.week.total - state.week.spent;
    return left < 0
      ? {text: `${money(-left)} over this week's limits`, tone: 'over'}
      : {text: `${money(left)} of this week's limits left`, tone: 'normal'};
  }
  return {
    text: `Spend ${money(spendableToday(state.dailyLimit, state.todayLeft))} today · ${money(state.remaining)} left this month`,
    tone: 'normal',
  };
}

/** What the budget card's ring and line show for a range. */
export function budgetCardFigures(state: MonthState, range: 'week' | 'month') {
  const budget = range === 'week' ? state.week.total : state.spendable;
  const used = range === 'week' ? state.week.spent : state.spent;
  return {
    budget: Math.max(0, budget),
    used: Math.max(0, used),
    over: range === 'week' ? used > budget + 0.004 : state.overspent,
  };
}

/**
 * How much of the month's day-to-day money is still unspent, 0 to 1: the
 * extra savings bar starts full and drains as spending comes in. Empty once
 * the month is overspent, or when there is nothing to spend.
 */
export function extraSavingsShare(
  state: Pick<MonthState, 'kind' | 'spendable' | 'projectedExtra'>,
): number {
  if (state.kind !== 'active' || state.spendable <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, state.projectedExtra / state.spendable));
}

/** "2×", "1.5×": a rollover cap in usual days. */
export function capLabel(cap: number): string {
  return `${cap.toLocaleString('en-IN', {maximumFractionDigits: 1})}×`;
}

/**
 * Why today's limit is not higher when the rollover cap holds it, or null
 * when it does not.
 */
export function capNote(
  state: Pick<MonthState, 'capped' | 'capLimit' | 'usualLimit' | 'heldBack'>,
  money: (amount: number) => string,
): string | null {
  if (!state.capped || state.capLimit === null || state.usualLimit <= 0) {
    return null;
  }
  const cap = Math.round((state.capLimit / state.usualLimit) * 10) / 10;
  return `Held at your ${capLabel(cap)} rollover cap. ${money(state.heldBack)} above it stays as extra savings.`;
}

/** The notice for a budget bills and the goal take all of, or more than all of. */
export function planNotice(state: MonthState, money: (amount: number) => string): string | null {
  if (state.kind === 'invalid') {
    return 'Your monthly bills and savings goal add up to more than your budget. Raise the budget or lower them to turn daily limits on.';
  }
  if (state.zeroSpendable && !state.overspent) {
    return `Bills and your savings goal take the whole ${money(state.total)} budget, so there is nothing to spend day to day this month.`;
  }
  return null;
}

/**
 * Why a monthly budget and savings goal cannot be saved together: bills and
 * the goal must fit in the budget (handbook 4.2). Null when they do, or when
 * the budget is being cleared.
 */
export function planProblem(
  total: string | number,
  bills: number,
  goal: number,
  symbol: string,
): string | null {
  if (total === '') {
    return null;
  }
  const check = validatePlan(Number(total) || 0, bills, goal);
  if (check.status !== 'over') {
    return null;
  }
  const money = (amount: number) => formatMoney(amount, symbol, {decimals: 0});
  return `Your bills (${money(bills)}) and savings goal (${money(goal)}) come to more than ${money(
    Number(total) || 0,
  )}. Make the budget at least ${money(bills + goal)}, or lower them.`;
}

export function partialLabel(state: Pick<MonthState, 'partialFrom'>): string | null {
  return state.partialFrom ? `Partial month, tracked from ${dayMonth(state.partialFrom)}` : null;
}
