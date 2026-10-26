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
 * Adaptive-via-week daily allowance. Weeks run Monday to Sunday, clipped to
 * the calendar month. This week's budget is the unspent monthly budget, shared
 * across the remaining days of the month in proportion to this week's length;
 * today's limit is what is left of it, spread over the days left in the week.
 * Money you skip rolls forward, and overspending lowers the coming days.
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

  const daysLeftInMonthFromWeekStart = daysBetween(weekStart, monthEnd) + 1;
  const weekDaysInMonth = daysBetween(weekStart, weekEnd) + 1;
  const daysLeftInWeek = daysBetween(day, weekEnd) + 1;

  const weekBudget =
    (Math.max(0, budget - spentBeforeWeek) * weekDaysInMonth) /
    daysLeftInMonthFromWeekStart;
  const dailyLimit =
    Math.max(0, weekBudget - spentWeekBeforeToday) / daysLeftInWeek;

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
