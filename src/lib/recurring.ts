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

export function isSeriesStart(row: TransactionRow): boolean {
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
  /** Already saved as a row inside the cycle, or paid before sign-up. */
  paidThisCycle: boolean;
  /** Paid before sign-up, so no row holds it and the budget still has to hold it back. */
  paidOutsideLedger?: boolean;
  /** The series was stopped or changed; listed only for a payment it made this cycle. */
  ended?: boolean;
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
  /**
   * Set when the user said this month's was paid before sign-up (that day,
   * `YYYY-MM-DD`): the cycle holding it counts the bill as paid.
   */
  paidSince?: string;
  /**
   * Set when the user said this month's is not paid yet (that day): the cycle
   * holding it keeps the bill reserved until it is paid.
   */
  notPaidSince?: string;
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
    const dates = list.map(row => calendarDateISO(row.transactionDate)).sort();
    const paidThisCycle = dates.some(date => date >= cycle.start && date <= cycle.end);
    // Copies whose marked row was deleted or unmarked are no longer a series,
    // but a payment it made this cycle is still a bill, not day-to-day spend.
    const ended = !root || !root.isRecurring;
    if (ended && !paidThisCycle) {
      continue;
    }
    const latest = list.reduce((a, b) =>
      calendarDateISO(b.transactionDate) > calendarDateISO(a.transactionDate) ? b : a,
    );
    const first = root ? calendarDateISO(root.transactionDate) : dates[0];
    commitments.push({
      key: rootId,
      label:
        latest.description ||
        latest.merchant ||
        root?.description ||
        root?.merchant ||
        'Monthly bill',
      amount: latest.amount,
      day: Number(first.slice(8, 10)),
      dueThisCycle: first <= cycle.end,
      paidThisCycle,
      ...(ended ? {ended: true} : {}),
    });
  }
  for (const bill of pending) {
    const paidBeforeSignup =
      bill.paidSince !== undefined && bill.paidSince <= cycle.end && bill.date > cycle.end;
    commitments.push({
      key: bill.key,
      label: bill.label,
      amount: bill.amount,
      day: Number(bill.date.slice(8, 10)),
      dueThisCycle: bill.date <= cycle.end || paidBeforeSignup,
      paidThisCycle: paidBeforeSignup,
      ...(paidBeforeSignup ? {paidOutsideLedger: true} : {}),
    });
  }
  return commitments.sort((a, b) => a.day - b.day);
}

/**
 * What the cycle's bills take out of the budget, and what of that the
 * cycle's spending does not hold: bills still to come, and ones paid before
 * sign-up.
 */
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
    if (!bill.paidThisCycle || bill.paidOutsideLedger) {
      upcoming += bill.amount;
    }
  }
  return {committed: Number(committed.toFixed(2)), upcoming: Number(upcoming.toFixed(2))};
}

/**
 * Every bill in a month, due this cycle or not: what the monthly budget is
 * shown and edited after, as onboarding does, so bills that start next cycle
 * still count.
 */
export function monthlyBillTotal(commitments: BillCommitment[]): number {
  // A stopped series no longer repeats; a changed one is counted as its replacement.
  const total = commitments.reduce((sum, bill) => (bill.ended ? sum : sum + bill.amount), 0);
  return Number(total.toFixed(2));
}

/**
 * Says a due copy is not to be added: the user set how that month's bill
 * stands themselves (see billMonths, copySkipper).
 */
export type CopySkip = (rootId: string, rootRef: string | null, date: string) => boolean;

/** Copies of marked rows that are due on or before `today` and not saved yet. */
export function dueRecurringTransactions(
  rows: TransactionRow[],
  today: string = localDateISO(),
  skip?: CopySkip,
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
      if (saved.has(externalRef) || skip?.(row.id, row.externalRef ?? null, date)) {
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
  skip?: CopySkip,
): Promise<number> {
  const due = dueRecurringTransactions(rows, today, skip);
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
