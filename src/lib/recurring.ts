import {supabase} from './supabase/client';
import {dataErrorMessage} from './supabase/errors';
import {
  NewTransaction,
  TransactionRow,
  calendarDateISO,
  localDateISO,
} from './transactionsStore';

/**
 * Rows marked "repeats monthly" are the start of a series. Each month after
 * the marked row's date, one copy is saved on the same day of the month (the
 * last day when the month is shorter). A copy's external_ref names its series
 * and month, and the (user_id, external_ref) unique constraint keeps a month
 * from being saved twice, however many devices or reloads run this.
 */
const REF_PREFIX = 'recurring:';

/** Months back a series is caught up, so a very old row cannot flood the ledger. */
export const MAX_CATCH_UP_MONTHS = 36;

export function recurringRef(rootId: string, month: string): string {
  return `${REF_PREFIX}${rootId}:${month}`;
}

/** The series a saved copy belongs to, or null for any other row. */
export function recurringRootId(row: {externalRef?: string | null}): string | null {
  const ref = row.externalRef ?? '';
  if (!ref.startsWith(REF_PREFIX)) {
    return null;
  }
  const id = ref.slice(REF_PREFIX.length).split(':')[0];
  return id || null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function isSeriesStart(row: TransactionRow): boolean {
  return (
    row.isRecurring &&
    row.kind === 'regular' &&
    recurringRootId(row) === null
  );
}

/** A monthly expense the budget sets aside before day-to-day spending. */
export type BillCommitment = {
  key: string;
  label: string;
  amount: number;
  /** Day of the month it falls on. */
  day: number;
  /** Comes due inside the cycle at all (a series starting later does not). */
  dueThisCycle: boolean;
  /** Already saved as a row inside the cycle. */
  paidThisCycle: boolean;
};

/** A row that belongs to a monthly expense series: the marked row or one of its copies. */
export function isBillRow(row: TransactionRow): boolean {
  return (
    row.type === 'expense' &&
    row.kind === 'regular' &&
    (row.isRecurring || recurringRootId(row) !== null)
  );
}

/** A bill that is picked but not in the ledger yet (see scheduledSetup). */
export type PendingBill = {
  key: string;
  label: string;
  amount: number;
  /** First date, `YYYY-MM-DD`. */
  date: string;
};

/**
 * Every monthly expense series in the ledger, plus bills still waiting for
 * their first date, judged against one budget cycle (`start`/`end` as
 * `YYYY-MM-DD`). A series is listed at its latest amount.
 */
export function billCommitments(
  rows: TransactionRow[],
  cycle: {start: string; end: string},
  pending: PendingBill[] = [],
): BillCommitment[] {
  const series = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    if (!isBillRow(row)) {
      continue;
    }
    const rootId = isSeriesStart(row) ? row.id : recurringRootId(row);
    if (!rootId) {
      continue;
    }
    const list = series.get(rootId) ?? [];
    list.push(row);
    series.set(rootId, list);
  }

  const commitments: BillCommitment[] = [];
  for (const [rootId, list] of series) {
    const root = list.find(row => row.id === rootId);
    // Copies whose marked row was deleted or unmarked are no longer a series.
    if (!root || !root.isRecurring) {
      continue;
    }
    const dates = list.map(row => calendarDateISO(row.transactionDate)).sort();
    const latest = list.reduce((a, b) =>
      calendarDateISO(b.transactionDate) > calendarDateISO(a.transactionDate) ? b : a,
    );
    const first = calendarDateISO(root.transactionDate);
    commitments.push({
      key: rootId,
      label:
        latest.description ||
        latest.merchant ||
        root.description ||
        root.merchant ||
        'Monthly bill',
      amount: latest.amount,
      day: Number(first.slice(8, 10)),
      dueThisCycle: first <= cycle.end,
      paidThisCycle: dates.some(date => date >= cycle.start && date <= cycle.end),
    });
  }
  for (const bill of pending) {
    commitments.push({
      key: bill.key,
      label: bill.label,
      amount: bill.amount,
      day: Number(bill.date.slice(8, 10)),
      dueThisCycle: bill.date <= cycle.end,
      paidThisCycle: false,
    });
  }
  return commitments.sort((a, b) => a.day - b.day);
}

/** What the cycle's bills take out of the budget, and what of that is still to come. */
export function committedTotals(commitments: BillCommitment[]): {
  committed: number;
  upcoming: number;
} {
  let committed = 0;
  let upcoming = 0;
  for (const bill of commitments) {
    if (!bill.dueThisCycle) {
      continue;
    }
    committed += bill.amount;
    if (!bill.paidThisCycle) {
      upcoming += bill.amount;
    }
  }
  return {committed: Number(committed.toFixed(2)), upcoming: Number(upcoming.toFixed(2))};
}

/** Copies of marked rows that are due on or before `today` and not saved yet. */
export function dueRecurringTransactions(
  rows: TransactionRow[],
  today: string = localDateISO(),
): NewTransaction[] {
  const saved = new Set<string>();
  for (const row of rows) {
    if (row.externalRef) {
      saved.add(row.externalRef);
    }
  }

  const due: NewTransaction[] = [];
  for (const row of rows) {
    if (!isSeriesStart(row)) {
      continue;
    }
    const [year, month, day] = calendarDateISO(row.transactionDate)
      .split('-')
      .map(Number);
    for (let step = 1; step <= MAX_CATCH_UP_MONTHS; step += 1) {
      const index = year * 12 + (month - 1) + step;
      const targetYear = Math.floor(index / 12);
      const targetMonth = (index % 12) + 1;
      const monthKey = `${targetYear}-${String(targetMonth).padStart(2, '0')}`;
      const date = `${monthKey}-${String(
        Math.min(day, daysInMonth(targetYear, targetMonth)),
      ).padStart(2, '0')}`;
      if (date > today) {
        break;
      }
      const externalRef = recurringRef(row.id, monthKey);
      if (saved.has(externalRef)) {
        continue;
      }
      due.push({
        type: row.type,
        amount: row.amount,
        categoryId: row.categoryId,
        description: row.description,
        merchant: row.merchant,
        transactionDate: date,
        paymentMethod: row.paymentMethod,
        notes: row.notes,
        kind: 'regular',
        isRecurring: true,
        externalRef,
      });
    }
  }
  return due;
}

/**
 * Saves every due copy. Returns how many rows were added; zero means the
 * ledger the caller holds is current.
 */
export async function saveDueRecurring(
  rows: TransactionRow[],
  userId: string,
  today: string = localDateISO(),
): Promise<number> {
  const due = dueRecurringTransactions(rows, today);
  if (due.length === 0) {
    return 0;
  }

  const {data, error} = await supabase
    .from('transactions')
    .upsert(
      due.map(item => ({
        user_id: userId,
        type: item.type,
        amount: item.amount,
        category_id: item.categoryId,
        description: item.description ?? null,
        merchant: item.merchant ?? null,
        transaction_date: item.transactionDate,
        payment_method: item.paymentMethod ?? null,
        notes: item.notes ?? null,
        kind: item.kind,
        is_recurring: true,
        source: 'manual',
        external_ref: item.externalRef ?? null,
      })),
      {onConflict: 'user_id,external_ref', ignoreDuplicates: true},
    )
    .select('id');
  if (error) {
    throw new Error(dataErrorMessage(error));
  }
  return data?.length ?? 0;
}
