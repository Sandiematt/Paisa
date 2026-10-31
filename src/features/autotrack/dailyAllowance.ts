import {
  BudgetSnapshot,
  DailyAllowance,
  DetectedTxn,
} from '../../lib/autotrack/types';
import {localDateISO} from '../../lib/transactionsStore';
import {cycleStartDay} from '../../lib/budgetCycle';
import {
  cycleRangeFor,
  remainingDays,
  toPaise,
} from '../../lib/budgetEngine';
import {BudgetFacts, budgetForCycle, hasBudget} from '../../lib/budgetInputs';

function rupees(paise: number): number {
  return paise / 100 + 0;
}

/**
 * Today's allowance from a snapshot: what is left of the cycle's day-to-day
 * money over the days left, today included (src/lib/budgetEngine.ts, the
 * one rolling limit). This is the form the phone's UPI spend guard runs
 * while Paisa is closed; the dashboard reads the engine directly.
 *
 * Mirrors the Kotlin BudgetPlan; both run the vectors in
 * __tests__/fixtures/dailyAllowanceVectors.json.
 *
 * `extraSpendByDate` is spend not in the snapshot yet (detections that have
 * not synced). Entries outside today's cycle or before tracking began, and a
 * snapshot for another cycle, are ignored. Returns null when there is no
 * budget, or before it starts.
 */
export function dailyAllowance(
  snapshot: BudgetSnapshot,
  today: Date | string,
  extraSpendByDate: Record<string, number> = {},
): DailyAllowance | null {
  const budget = toPaise(snapshot.monthlyBudget);
  if (budget <= 0) {
    return null;
  }
  const todayKey = typeof today === 'string' ? today.slice(0, 10) : localDateISO(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(todayKey)) {
    return null;
  }
  if (snapshot.trackingStart && todayKey < snapshot.trackingStart) {
    return null;
  }

  const cycle = cycleRangeFor(todayKey, snapshot.cycleStartDay ?? 1);
  const from =
    snapshot.trackingStart && snapshot.trackingStart > cycle.start
      ? snapshot.trackingStart
      : cycle.start;

  let before = 0;
  let spentToday = 0;
  const add = (spend: Record<string, number>) => {
    for (const [date, value] of Object.entries(spend)) {
      const amount = toPaise(value);
      if (date < from || date > cycle.end) {
        continue;
      }
      if (date < todayKey) {
        before += amount;
      } else if (date === todayKey) {
        spentToday += amount;
      }
    }
  };
  if (snapshot.monthKey === cycle.start.slice(0, 7)) {
    add(snapshot.spendByDate);
  }
  add(extraSpendByDate);

  const daysLeft = remainingDays(todayKey, cycle);
  const left = budget - before;
  const limit = daysLeft > 0 ? Math.floor(Math.max(0, left) / daysLeft) : 0;
  return {
    date: todayKey,
    cycleStart: cycle.start,
    cycleEnd: cycle.end,
    daysLeft,
    budget: rupees(budget),
    spentBeforeToday: rupees(before),
    dailyLimit: rupees(limit),
    spentToday: rupees(spentToday),
    remainingToday: rupees(limit - spentToday),
    remainingMonth: rupees(left - spentToday),
  };
}

/**
 * The snapshot the phone's spend guard runs from while Paisa is closed:
 * this cycle's day-to-day money and the ledger's spending, unsynced
 * detections left out (the phone adds its own). Before the budget starts
 * it is the coming cycle's, so the guard switches on by itself on its first
 * day. A plan that needs fixing, or none, turns the guard off.
 *
 * `dataAsOfMillis` is when the ledger fetch behind `facts.transactions`
 * started; detections saved after it still count on the phone.
 */
export function snapshotForBudget(
  facts: BudgetFacts,
  today: string,
  dataAsOfMillis = 0,
): BudgetSnapshot {
  const payday = cycleStartDay(facts.payday);
  const ledgerOnly = {...facts, unsyncedSpend: undefined};
  let budget = budgetForCycle(ledgerOnly, today);
  const waiting = budget.state.kind === 'waiting' && budget.state.startsOn !== null;
  if (waiting && budget.state.startsOn) {
    budget = budgetForCycle(ledgerOnly, budget.state.startsOn);
  }
  const {cycle, inputs, state} = budget;
  const from = inputs.countFrom ?? cycle.start;
  const spendByDate: Record<string, number> = {};
  for (const [date, amount] of Object.entries(inputs.spendByDate)) {
    if (date >= from) {
      spendByDate[date] = amount;
    }
  }
  const money = toPaise(state.spendable) - toPaise(state.alreadySpent);
  const active = hasBudget(facts) && state.kind !== 'invalid';
  return {
    monthKey: cycle.start.slice(0, 7),
    // Nothing left still keeps the guard on: a token paisa, so every payment warns.
    monthlyBudget: active ? Math.max(0.01, rupees(money)) : 0,
    spendByDate,
    dataAsOfMillis,
    cycleStartDay: payday,
    ...(from > cycle.start || waiting ? {trackingStart: from} : {}),
  };
}

/**
 * Detected payments that are not in the Paisa ledger a snapshot was built
 * from, as extra spend per local day. Debits that succeeded and are not
 * flagged as possible duplicates, and either not saved yet or saved after the
 * ledger was read (`syncedAtMillis > dataAsOfMillis`). Credits and payments of
 * unknown direction are never spend. Mirrors the native spend guard.
 */
export function unsyncedSpendByDate(
  detections: readonly DetectedTxn[],
  dataAsOfMillis = 0,
): Record<string, number> {
  const spend: Record<string, number> = {};
  for (const item of detections) {
    if (
      item.status !== 'SUCCESS' ||
      item.direction !== 'DEBIT' ||
      item.flag ||
      (item.synced && (item.syncedAtMillis ?? 0) <= dataAsOfMillis)
    ) {
      continue;
    }
    const amount = Number(item.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      continue;
    }
    const date = localDateISO(new Date(item.detectedAtMillis));
    spend[date] = (spend[date] ?? 0) + amount;
  }
  return spend;
}
