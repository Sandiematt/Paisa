import {User} from '@supabase/supabase-js';

import {isSeriesStart, recurringRef} from './recurring';
import {
  ScheduledEntry,
  nextMonthlyDate,
  saveScheduledSetup,
  scheduledFromUser,
} from './scheduledSetup';
import {
  TransactionPatch,
  TransactionRow,
  calendarDateISO,
  localDateISO,
  roundMoney,
  updateTransaction,
} from './transactionsStore';

/**
 * Monthly bills as Profile edits them. A bill is either a series in the
 * ledger (a row marked "repeats monthly" and its copies) or one still waiting
 * for its first date (see scheduledSetup). A change never rewrites a payment
 * already made: a ledger series is stopped, and the changed bill waits for its
 * next due date like a new one, so it never sits in the ledger ahead of time.
 */
export type EditableBill = {
  /** `ledger:<root row id>`, or the waiting entry's ref. */
  key: string;
  source: 'ledger' | 'scheduled';
  label: string;
  amount: number;
  /** Day of the month it is due, 1-31. */
  day: number;
  /** When it is next added, `YYYY-MM-DD`. */
  nextDate: string;
};

export type BillInput = {label: string; amount: number; day: number};

const LEDGER_PREFIX = 'ledger:';
const BILL_REF_PREFIX = 'onboarding:bill:';

export function editableBills(
  rows: TransactionRow[],
  scheduled: ScheduledEntry[],
  today: string = localDateISO(),
): EditableBill[] {
  const bills: EditableBill[] = [];
  for (const row of rows) {
    if (row.type !== 'expense' || !isSeriesStart(row)) {
      continue;
    }
    // Copies repeat the marked row, so its amount and day are the bill's.
    const day = Number(calendarDateISO(row.transactionDate).slice(8, 10));
    bills.push({
      key: `${LEDGER_PREFIX}${row.id}`,
      source: 'ledger',
      label: row.description || row.merchant || 'Monthly bill',
      amount: row.amount,
      day,
      nextDate: nextMonthlyDate(day, today),
    });
  }
  for (const entry of scheduled) {
    if (entry.type !== 'expense') {
      continue;
    }
    bills.push({
      key: entry.ref,
      source: 'scheduled',
      label: entry.description,
      amount: entry.amount,
      day: Number(entry.date.slice(8, 10)),
      nextDate: entry.date,
    });
  }
  return bills.sort((a, b) => a.day - b.day || a.label.localeCompare(b.label));
}

/**
 * Stops a series: no more copies, and its first row is filed as one of its
 * own copies, so it still counts as a bill rather than day-to-day spending.
 */
export function endSeriesPatch(root: TransactionRow): TransactionPatch {
  return {
    isRecurring: false,
    externalRef: recurringRef(root.id, calendarDateISO(root.transactionDate).slice(0, 7)),
  };
}

/**
 * The waiting list with the bill at `ref` set to `input`, added when new. It
 * waits for its next due date; a "paid this month" answer stays only while
 * that date does.
 */
export function withScheduledBill(
  entries: ScheduledEntry[],
  ref: string,
  input: BillInput,
  today: string = localDateISO(),
  category: {slug: string; categoryId?: string} = {slug: 'bills'},
): ScheduledEntry[] {
  const date = nextMonthlyDate(input.day, today);
  const existing = entries.find(entry => entry.ref === ref);
  const next: ScheduledEntry = {
    ref,
    type: 'expense',
    amount: roundMoney(input.amount),
    slug: existing?.slug ?? category.slug,
    ...(existing?.categoryId ?? category.categoryId
      ? {categoryId: existing?.categoryId ?? category.categoryId}
      : {}),
    description: input.label.trim(),
    date,
    ...(existing && existing.date === date && existing.paidSince
      ? {paidSince: existing.paidSince}
      : {}),
    ...(existing && existing.date === date && existing.unpaidSince
      ? {unpaidSince: existing.unpaidSince}
      : {}),
  };
  return existing
    ? entries.map(entry => (entry.ref === ref ? next : entry))
    : [...entries, next];
}

export function withoutScheduledBill(entries: ScheduledEntry[], ref: string): ScheduledEntry[] {
  return entries.filter(entry => entry.ref !== ref);
}

function rootOf(bill: EditableBill, rows: TransactionRow[]): TransactionRow {
  const id = bill.key.slice(LEDGER_PREFIX.length);
  const root = rows.find(row => row.id === id);
  if (!root) {
    throw new Error('That bill is no longer in your transactions. Refresh and try again.');
  }
  return root;
}

/** Saves a changed bill, or a new one when `bill` is null. */
export async function saveBill(
  user: User,
  rows: TransactionRow[],
  bill: EditableBill | null,
  input: BillInput,
) {
  const waiting = scheduledFromUser(user);
  if (bill?.source === 'scheduled') {
    await saveScheduledSetup(withScheduledBill(waiting, bill.key, input));
    return;
  }
  if (!bill) {
    await saveScheduledSetup(withScheduledBill(waiting, `${BILL_REF_PREFIX}custom-${Date.now()}`, input));
    return;
  }
  // The changed bill is queued first, so a failure never loses the bill.
  const root = rootOf(bill, rows);
  await saveScheduledSetup(
    withScheduledBill(waiting, `${BILL_REF_PREFIX}${root.id}-${Date.now()}`, input, localDateISO(), {
      slug: 'bills',
      ...(root.categoryId ? {categoryId: root.categoryId} : {}),
    }),
  );
  try {
    await updateTransaction(root.id, endSeriesPatch(root));
  } catch (error) {
    await saveScheduledSetup(waiting).catch(() => {});
    throw error;
  }
}

/** Stops a bill. Payments already made stay in the ledger. */
export async function removeBill(user: User, rows: TransactionRow[], bill: EditableBill) {
  if (bill.source === 'scheduled') {
    await saveScheduledSetup(withoutScheduledBill(scheduledFromUser(user), bill.key));
    return;
  }
  const root = rootOf(bill, rows);
  await updateTransaction(root.id, endSeriesPatch(root));
}
