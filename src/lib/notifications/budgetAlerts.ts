import {formatMoney} from '../formatMoney';
import {roundMoney} from '../transactionsStore';
import {NotificationKind, NotificationPrefs} from './types';

export type BudgetThreshold = 80 | 100;

export type BudgetAlertDraft = {
  id: string;
  kind: Extract<NotificationKind, 'budget_warning' | 'budget_exceeded'>;
  title: string;
  body: string;
};

export type BudgetAlertPlan = {
  /** The one alert worth showing now, if any. */
  fire: BudgetAlertDraft | null;
  /** Keys to remember as handled, whether or not an alert was shown. */
  consume: string[];
};

/**
 * A budget period's key: the month its cycle starts in (the calendar month,
 * or the month of the payday the cycle runs from), so the key resets when a
 * new cycle starts.
 */
export function budgetPeriodKey(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${now.getFullYear()}-${month}`;
}

/** One key per user, budget period and threshold: the dedupe identity. */
export function budgetAlertKey(
  userId: string,
  period: string,
  threshold: BudgetThreshold,
): string {
  return `budget:${userId}:${period}:${threshold}`;
}

function spendCrossed(
  spent: number,
  budget: number,
  threshold: BudgetThreshold,
): boolean {
  // Cents arithmetic, so 80.00 of 100.00 counts as 80% without float noise.
  const spentCents = Math.round(spent * 100);
  const budgetCents = Math.round(budget * 100);
  return threshold === 100
    ? spentCents > budgetCents
    : spentCents * 100 >= budgetCents * threshold;
}

function amount(value: number, symbol: string): string {
  const rounded = roundMoney(value);
  return formatMoney(rounded, symbol, {
    decimals: Number.isInteger(rounded) ? 0 : 2,
  });
}

export type BudgetAlertInput = {
  userId: string;
  now: Date;
  /** Day-to-day spending so far this budget cycle. */
  spent: number;
  /** What the cycle has for day-to-day spending; zero or less means none is set. */
  budget: number;
  /** The cycle's key (budgetPeriodKey of its first day); the calendar month of `now` when absent. */
  period?: string;
  currencySymbol: string;
  prefs: Pick<NotificationPrefs, 'budgetExceeded' | 'budgetWarning'>;
  /** Keys already handled for this user. */
  handled: ReadonlySet<string>;
};

/**
 * Decides what a spending update should notify.
 *
 * Every crossed threshold that has not been handled is consumed together, but
 * only the highest one is shown: a jump straight past the budget should say
 * "exceeded", not also announce 80%. Thresholds crossed while their toggle is
 * off are consumed silently, so turning a toggle on later does not replay a
 * stale alert.
 */
export function planBudgetAlert(input: BudgetAlertInput): BudgetAlertPlan {
  const {userId, now, spent, budget, currencySymbol, prefs, handled} = input;
  if (!Number.isFinite(budget) || budget <= 0 || !Number.isFinite(spent)) {
    return {fire: null, consume: []};
  }

  const period = input.period ?? budgetPeriodKey(now);
  const crossed = ([80, 100] as BudgetThreshold[]).filter(
    threshold =>
      spendCrossed(spent, budget, threshold) &&
      !handled.has(budgetAlertKey(userId, period, threshold)),
  );
  if (crossed.length === 0) {
    return {fire: null, consume: []};
  }

  const consume = crossed.map(threshold =>
    budgetAlertKey(userId, period, threshold),
  );
  const top = crossed[crossed.length - 1];
  const id = budgetAlertKey(userId, period, top);

  if (top === 100) {
    if (!prefs.budgetExceeded) {
      return {fire: null, consume};
    }
    // Sent once, the first time the month goes over (handbook 3.2). It asks
    // for a bigger budget, which is what turns the daily limits back on.
    const over = roundMoney(spent - budget);
    return {
      consume,
      fire: {
        id,
        kind: 'budget_exceeded',
        title: "You've gone over this month's budget",
        body: `${amount(over, currencySymbol)} over so far. Increase your budget to keep your daily limits on track.`,
      },
    };
  }

  if (!prefs.budgetWarning) {
    return {fire: null, consume};
  }
  const left = roundMoney(budget - spent);
  return {
    consume,
    fire: {
      id,
      kind: 'budget_warning',
      title: "You've used 80% of your budget",
      body: `${amount(spent, currencySymbol)} of ${amount(budget, currencySymbol)} spent this month. ${amount(left, currencySymbol)} left.`,
    },
  };
}

/** Drops handled keys from months before the cutoff period (`YYYY-MM`). */
export function pruneHandledKeys(
  handled: Record<string, string>,
  keepFromPeriod: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [key, value] of Object.entries(handled)) {
    const parts = key.split(':');
    // budget:<userId>:<YYYY-MM>:<threshold> — non-budget keys are kept.
    const period = parts[0] === 'budget' ? parts[parts.length - 2] : null;
    if (period === null || period >= keepFromPeriod) {
      next[key] = value;
    }
  }
  return next;
}
