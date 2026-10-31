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
    text: `Spend ${money(shownLimit(state.dailyLimit))} today · ${money(state.remaining)} left this month`,
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
