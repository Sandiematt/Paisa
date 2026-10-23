import {CategoryRow} from '../../lib/categoriesStore';
import {
  TransactionRow,
  isLedgerSpecial,
  roundMoney,
} from '../../lib/transactionsStore';
import {
  HomeRange,
  addDays,
  parseCalendarDate,
  periodFor,
  startOfDay,
  startOfWeekMonday,
} from './homeReport';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Time-of-day greeting, e.g. "Good evening,". */
export function greetingForHour(hour: number): string {
  if (hour < 5) return 'Still up,';
  if (hour < 12) return 'Good morning,';
  if (hour < 17) return 'Good afternoon,';
  if (hour < 21) return 'Good evening,';
  return 'Good night,';
}

/** "1 October" from a day of month and a 0-based month index. */
export function dayMonthLabel(day: number, monthIndex: number): string {
  return `${day} ${MONTH_NAMES[monthIndex] ?? ''}`.trim();
}

/**
 * Whole days left in the period, counting today (the last day reads "1 day to
 * go": the budget still applies until midnight).
 */
export function daysToGo(range: HomeRange, now = new Date()): number {
  const period = periodFor(range, now);
  const today = startOfDay(now);
  const left = Math.round((period.end.getTime() - today.getTime()) / 86400000) + 1;
  return Math.max(0, left);
}

export function daysToGoLabel(days: number): string {
  return `${days} ${days === 1 ? 'day' : 'days'} to go`;
}

export type WeekNudge = {
  /** Changes every week so a dismissal only hides the current week's nudge. */
  key: string;
  direction: 'under' | 'over';
  /** Absolute difference, rounded to whole money. */
  amount: number;
  thisWeek: number;
  lastWeek: number;
  /** Category that moved most in the same direction as the total. */
  category: {name: string; amount: number} | null;
};

function spendByCategory(
  rows: TransactionRow[],
  start: Date,
  end: Date,
): {total: number; byCategory: Map<string, number>} {
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    if (row.type !== 'expense' || row.amount <= 0 || isLedgerSpecial(row)) {
      continue;
    }
    const day = parseCalendarDate(row.transactionDate).getTime();
    if (Number.isNaN(day) || day < start.getTime() || day > end.getTime()) {
      continue;
    }
    total += row.amount;
    const key = row.categoryId ?? 'uncategorized';
    byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount);
  }
  return {total: roundMoney(total), byCategory};
}

/**
 * Spending this week so far against the same days last week (Monday to
 * today), so a quiet Monday is not reported as "under last week". Returns
 * null when there is nothing meaningful to compare: no spending in either
 * span, or no difference.
 */
export function weeklySpendNudge(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  now = new Date(),
): WeekNudge | null {
  const today = startOfDay(now);
  const weekStart = startOfWeekMonday(today);
  const elapsed = Math.round((today.getTime() - weekStart.getTime()) / 86400000);
  const lastStart = addDays(weekStart, -7);
  const lastEnd = addDays(lastStart, elapsed);

  const current = spendByCategory(transactions, weekStart, today);
  const previous = spendByCategory(transactions, lastStart, lastEnd);
  if (current.total <= 0 || previous.total <= 0) {
    return null;
  }

  const delta = roundMoney(current.total - previous.total);
  if (Math.abs(delta) < 0.5) {
    return null;
  }
  const direction = delta < 0 ? 'under' : 'over';

  let best: {id: string; change: number} | null = null;
  const ids = new Set([...current.byCategory.keys(), ...previous.byCategory.keys()]);
  for (const id of ids) {
    const change = (current.byCategory.get(id) ?? 0) - (previous.byCategory.get(id) ?? 0);
    const sameWay = direction === 'under' ? change < 0 : change > 0;
    if (sameWay && (best === null || Math.abs(change) > Math.abs(best.change))) {
      best = {id, change};
    }
  }

  let category: WeekNudge['category'] = null;
  if (best !== null) {
    const found: {id: string; change: number} = best;
    const row = categories.find(item => item.id === found.id);
    category = {
      name: row?.name ?? 'Uncategorized',
      amount: roundMoney(Math.abs(found.change)),
    };
  }

  return {
    key: `${weekStart.getFullYear()}-${weekStart.getMonth() + 1}-${weekStart.getDate()}`,
    direction,
    amount: roundMoney(Math.abs(delta)),
    thisWeek: current.total,
    lastWeek: previous.total,
    category,
  };
}

/** "3 Oct" for a calendar date string (`YYYY-MM-DD` or an ISO timestamp). */
export function shortDateLabel(isoDate: string): string {
  const date = parseCalendarDate(isoDate);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return `${date.getDate()} ${MONTH_NAMES[date.getMonth()].slice(0, 3)}`;
}

/**
 * Transactions inside the current Home period, newest first, ledger
 * adjustments and opening balances left out. `expenses` keeps only spending
 * (what a budget counts); `all` also keeps income (what savings come from).
 */
export function relatedTransactions(
  transactions: TransactionRow[],
  range: HomeRange,
  kind: 'expenses' | 'all',
  limit: number,
  now = new Date(),
): TransactionRow[] {
  const period = periodFor(range, now);
  return transactions
    .filter(row => {
      if (isLedgerSpecial(row) || row.amount <= 0) {
        return false;
      }
      if (kind === 'expenses' && row.type !== 'expense') {
        return false;
      }
      const day = parseCalendarDate(row.transactionDate).getTime();
      return (
        !Number.isNaN(day) &&
        day >= period.start.getTime() &&
        day <= period.end.getTime()
      );
    })
    .sort((a, b) => {
      const byDay =
        parseCalendarDate(b.transactionDate).getTime() -
        parseCalendarDate(a.transactionDate).getTime();
      if (byDay !== 0) {
        return byDay;
      }
      return a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0;
    })
    .slice(0, limit);
}
