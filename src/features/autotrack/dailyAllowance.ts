import {
  BudgetSnapshot,
  DailyAllowance,
  DetectedTxn,
} from '../../lib/autotrack/types';
import {
  TransactionRow,
  isLedgerSpecial,
  localDateISO,
} from '../../lib/transactionsStore';
import {BudgetCycle, cycleFor, cycleStartDay} from '../../lib/budgetCycle';
import {isBillRow} from '../../lib/recurring';
import {
  addDays,
  parseCalendarDate,
  startOfDay,
  startOfWeekMonday,
} from '../home/homeReport';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Half-up to 2 decimals, matching the native BudgetPlan. */
function round2(value: number): number {
  const rounded =
    (Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-9)) / 100;
  return rounded + 0; // folds -0 into 0
}

/** Whole days from `from` to `to`, DST-safe. */
function daysBetween(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/** The month a cycle starts in, "YYYY-MM": the snapshot's identity. */
function cycleKeyOf(cycle: BudgetCycle): string {
  return localDateISO(cycle.start).slice(0, 7);
}

/**
 * How a budget splits into weeks and days over its cycle (the calendar month,
 * or payday to payday). A cycle holds length / 7 weeks (4.43 for October),
 * so the weekly budget is the budget over that, and the daily budget is a
 * seventh of a week. Seven daily budgets make a week and the days of the cycle
 * add back up to the budget.
 */
export function budgetAllocation(
  monthlyBudget: number,
  day: Date,
  payday?: number | null,
): {weeksInMonth: number; weeklyBudget: number; dailyBudget: number} {
  const cycleDays = cycleFor(day, payday).length;
  const budget =
    Number.isFinite(monthlyBudget) && monthlyBudget > 0 ? monthlyBudget : 0;
  const weeklyBudget = (budget * 7) / cycleDays;
  return {
    weeksInMonth: cycleDays / 7,
    weeklyBudget,
    dailyBudget: weeklyBudget / 7,
  };
}

/**
 * Daily allowance from the budget. Weeks run Monday to Sunday, clipped to the
 * budget cycle (the calendar month, or payday to payday when
 * `snapshot.cycleStartDay` is set). Each week gets its share of the budget
 * (see budgetAllocation; a clipped week gets a daily budget per day it has),
 * capped by what is left of the cycle. Today's limit is the daily budget,
 * lowered when earlier overspending this week leaves less than that per
 * remaining day. Money you skip is not added to later days, so a quiet start
 * never turns into a whole cycle's budget in one week.
 *
 * Mirrors the Kotlin BudgetPlan; both run the vectors in
 * __tests__/fixtures/dailyAllowanceVectors.json.
 *
 * `extraSpendByDate` is spend not in the snapshot yet (detections that have
 * not synced). Entries outside today's cycle, and a snapshot for another
 * cycle, are ignored. Returns null when there is no budget.
 */
export function dailyAllowance(
  snapshot: BudgetSnapshot,
  today: Date | string,
  extraSpendByDate: Record<string, number> = {},
): DailyAllowance | null {
  const budget = Number(snapshot.monthlyBudget);
  if (!Number.isFinite(budget) || budget <= 0) {
    return null;
  }

  const day = startOfDay(
    typeof today === 'string' ? parseCalendarDate(today) : today,
  );
  if (Number.isNaN(day.getTime())) {
    return null;
  }

  const payday = snapshot.cycleStartDay ?? 1;
  const cycle = cycleFor(day, payday);
  const cycleStartKey = localDateISO(cycle.start);
  const cycleEndKey = localDateISO(cycle.end);
  const monday = startOfWeekMonday(day);
  const weekStart = monday < cycle.start ? cycle.start : monday;
  const sunday = addDays(monday, 6);
  const weekEnd = sunday > cycle.end ? cycle.end : sunday;

  const todayKey = localDateISO(day);
  const weekStartKey = localDateISO(weekStart);

  let spentBeforeWeek = 0;
  let spentWeekBeforeToday = 0;
  let spentToday = 0;
  const add = (spend: Record<string, number>) => {
    for (const [date, value] of Object.entries(spend)) {
      const amount = Number(value);
      if (date < cycleStartKey || date > cycleEndKey || !Number.isFinite(amount)) {
        continue;
      }
      if (date < weekStartKey) {
        spentBeforeWeek += amount;
      } else if (date < todayKey) {
        spentWeekBeforeToday += amount;
      } else if (date === todayKey) {
        spentToday += amount;
      }
    }
  };
  if (snapshot.monthKey === cycleKeyOf(cycle)) {
    add(snapshot.spendByDate);
  }
  add(extraSpendByDate);

  const weekDaysInCycle = daysBetween(weekStart, weekEnd) + 1;
  const daysLeftInWeek = daysBetween(day, weekEnd) + 1;

  const {dailyBudget} = budgetAllocation(budget, day, payday);
  const weekBudget = Math.min(
    dailyBudget * weekDaysInCycle,
    Math.max(0, budget - spentBeforeWeek),
  );
  const dailyLimit = Math.min(
    dailyBudget,
    Math.max(0, weekBudget - spentWeekBeforeToday) / daysLeftInWeek,
  );

  return {
    date: todayKey,
    weekStart: weekStartKey,
    weekEnd: localDateISO(weekEnd),
    weekBudget: round2(weekBudget),
    spentWeekBeforeToday: round2(spentWeekBeforeToday),
    daysLeftInWeek,
    dailyLimit: round2(dailyLimit),
    spentToday: round2(spentToday),
    remainingToday: round2(dailyLimit - spentToday),
    remainingWeek: round2(weekBudget - spentWeekBeforeToday - spentToday),
  };
}

export type BudgetPlanInputs = {
  /** The budget as set, bills included. */
  monthlyBudget: number;
  /** Payday; null keeps calendar months. */
  payday?: number | null;
  /** Monthly bills due this cycle, set aside before day-to-day spending. */
  committed?: number;
};

/**
 * Per-day day-to-day spend for the cycle holding `now`: regular expenses,
 * with opening-balance and balance adjustment rows left out (see walletParts
 * in homeReport), and monthly bills left out too, since their money is taken
 * off the budget up front (`committed`) rather than out of the day they land
 * on. The snapshot's budget is what remains for day-to-day spending.
 *
 * `dataAsOfMillis` is when the ledger fetch behind `transactions` started.
 * Detections saved after it are not in the ledger yet, so they still count as
 * extra spend. 0 (unknown) double counts rather than under counts.
 */
export function buildBudgetSnapshot(
  transactions: TransactionRow[],
  plan: number | BudgetPlanInputs,
  now = new Date(),
  dataAsOfMillis = 0,
): BudgetSnapshot {
  const inputs = typeof plan === 'number' ? {monthlyBudget: plan} : plan;
  const payday = cycleStartDay(inputs.payday);
  const cycle = cycleFor(now, payday);
  const startKey = localDateISO(cycle.start);
  const endKey = localDateISO(cycle.end);
  const spendByDate: Record<string, number> = {};
  for (const row of transactions) {
    if (row.type !== 'expense' || isLedgerSpecial(row) || isBillRow(row)) {
      continue;
    }
    const date = row.transactionDate.slice(0, 10);
    if (date < startKey || date > endKey) {
      continue;
    }
    spendByDate[date] = round2((spendByDate[date] ?? 0) + row.amount);
  }
  const budget = Number.isFinite(inputs.monthlyBudget) ? inputs.monthlyBudget : 0;
  const committed =
    inputs.committed && Number.isFinite(inputs.committed) ? inputs.committed : 0;
  return {
    monthKey: cycleKeyOf(cycle),
    // Bills can eat the whole budget; zero would switch the guard off, so a
    // budget fully taken by bills keeps a token cent of day-to-day room.
    monthlyBudget: budget > 0 ? round2(Math.max(0.01, budget - committed)) : 0,
    spendByDate,
    dataAsOfMillis,
    cycleStartDay: payday,
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
