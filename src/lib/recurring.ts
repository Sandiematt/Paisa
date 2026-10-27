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
