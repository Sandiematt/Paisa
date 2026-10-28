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
import {
  addDays,
  daysInMonth,
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

function monthKeyOf(date: Date): string {
  return localDateISO(date).slice(0, 7);
}

/**
 * How a monthly budget splits into weeks and days. A month holds
 * daysInMonth / 7 weeks (4.43 for October), so the weekly budget is the
 * monthly budget over that, and the daily budget is a seventh of a week.
 * Seven daily budgets make a week and the days of the month add back up to
 * the monthly budget.
 */
export function budgetAllocation(
  monthlyBudget: number,
  day: Date,
): {weeksInMonth: number; weeklyBudget: number; dailyBudget: number} {
  const monthDays = daysInMonth(day.getFullYear(), day.getMonth());
  const budget =
    Number.isFinite(monthlyBudget) && monthlyBudget > 0 ? monthlyBudget : 0;
  const weeklyBudget = (budget * 7) / monthDays;
  return {
    weeksInMonth: monthDays / 7,
    weeklyBudget,
    dailyBudget: weeklyBudget / 7,
  };
}

/**
 * Daily allowance from the monthly budget. Weeks run Monday to Sunday,
 * clipped to the calendar month. Each week gets its share of the monthly
 * budget (see budgetAllocation; a clipped week gets a daily budget per day it
 * has), capped by what is left of the month. Today's limit is the daily
 * budget, lowered when earlier overspending this week leaves less than that
 * per remaining day. Money you skip is not added to later days, so a quiet
 * start of the month never turns into a whole month's budget in one week.
 *
 * Mirrors the Kotlin BudgetPlan; both run the vectors in
 * __tests__/fixtures/dailyAllowanceVectors.json.
 *
 * `extraSpendByDate` is spend not in the snapshot yet (detections that have
 * not synced). Entries outside today's month, and a snapshot for another
 * month, are ignored. Returns null when there is no budget.
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

  const year = day.getFullYear();
  const month = day.getMonth();
  const monthKey = monthKeyOf(day);
  const monthEnd = new Date(year, month, daysInMonth(year, month));
  const monday = startOfWeekMonday(day);
  const monthStart = new Date(year, month, 1);
  const weekStart = monday < monthStart ? monthStart : monday;
  const sunday = addDays(monday, 6);
  const weekEnd = sunday > monthEnd ? monthEnd : sunday;

  const todayKey = localDateISO(day);
  const weekStartKey = localDateISO(weekStart);

  let spentBeforeWeek = 0;
  let spentWeekBeforeToday = 0;
  let spentToday = 0;
  const add = (spend: Record<string, number>) => {
    for (const [date, value] of Object.entries(spend)) {
      const amount = Number(value);
      if (!date.startsWith(`${monthKey}-`) || !Number.isFinite(amount)) {
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
  if (snapshot.monthKey === monthKey) {
    add(snapshot.spendByDate);
  }
  add(extraSpendByDate);

  const weekDaysInMonth = daysBetween(weekStart, weekEnd) + 1;
  const daysLeftInWeek = daysBetween(day, weekEnd) + 1;

  const {dailyBudget} = budgetAllocation(budget, day);
  const weekBudget = Math.min(
    dailyBudget * weekDaysInMonth,
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

/**
 * Per-day expense spend for the month of `now`, the same rows the dashboard
 * counts as spent: regular expenses only, with opening-balance and balance
 * adjustment rows left out (see walletParts in homeReport).
 *
 * `dataAsOfMillis` is when the ledger fetch behind `transactions` started.
 * Detections saved after it are not in the ledger yet, so they still count as
 * extra spend. 0 (unknown) double counts rather than under counts.
 */
export function buildBudgetSnapshot(
  transactions: TransactionRow[],
  monthlyBudget: number,
  now = new Date(),
  dataAsOfMillis = 0,
): BudgetSnapshot {
  const monthKey = monthKeyOf(now);
  const spendByDate: Record<string, number> = {};
  for (const row of transactions) {
    if (row.type !== 'expense' || isLedgerSpecial(row)) {
      continue;
    }
    const date = row.transactionDate.slice(0, 10);
    if (!date.startsWith(`${monthKey}-`)) {
      continue;
    }
    spendByDate[date] = round2((spendByDate[date] ?? 0) + row.amount);
  }
  return {
    monthKey,
    monthlyBudget: Number.isFinite(monthlyBudget) ? monthlyBudget : 0,
    spendByDate,
    dataAsOfMillis,
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
