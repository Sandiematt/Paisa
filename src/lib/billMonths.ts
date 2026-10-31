import {BillInstance, BillStatus, CycleRange} from './budgetEngine';
import {PendingBill, isBillRow, isSeriesStart, recurringRootId} from './recurring';
import {supabase} from './supabase/client';
import {BillMonthRow, BillMonthStatus} from './supabase/database.types';
import {dataErrorMessage} from './supabase/errors';
import {isMissingSchema} from './supabase/schema';
import {
  TransactionRow,
  calendarDateISO,
  createTransaction,
  deleteTransaction,
  roundMoney,
} from './transactionsStore';

/**
 * A monthly bill in one budget cycle. Bills are added for the user on their
 * due day and that counts as paid, so most months need nothing stored. When
 * the user says otherwise (not paid yet, paid outside Paisa, paid by an
 * expense already logged, not owed), a bill_months row records it for that
 * bill and cycle, and the due-day copy is not added.
 *
 * A bill still not paid when its cycle ends stays reserved: it carries into
 * the next cycles, with the money its cycle held back for it, until it is
 * paid or dismissed (see budgetEngine, BillInstance.carried).
 */
export type BillMonth = {
  billKey: string;
  cycleStart: string;
  status: BillMonthStatus;
  label: string;
  plannedAmount: number;
  paidAmount: number | null;
  transactionId: string | null;
  /** When an unpaid bill was settled (paid or dismissed), `YYYY-MM-DD`. */
  settledOn: string | null;
};

export type CycleBill = BillInstance & {
  /** The series' first row id, or the ref of a bill still waiting for its first date. */
  billKey: string;
  /** The cycle this bill is for: earlier than the cycle shown when carried. */
  cycleStart: string;
  origin: 'ledger' | 'scheduled' | 'carried';
  /** Day of the month it is due. */
  day: number;
  /** Comes due inside the cycle at all; a bill starting next cycle does not. */
  dueThisCycle: boolean;
  /** A stopped or changed series, listed only for what it did this cycle. */
  ended?: boolean;
  /** Rows that paid it: due-day copies, or an expense linked to it. */
  rowIds: string[];
  /** A bill_months row says how it stands. */
  stored: boolean;
};

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** The date in a cycle that falls on `day` of a month (the last day when the month is shorter). */
export function dueDateInCycle(day: number, cycle: CycleRange): string | undefined {
  const [startYear, startMonth] = cycle.start.split('-').map(Number);
  for (let step = 0; step <= 1; step += 1) {
    const index = startYear * 12 + (startMonth - 1) + step;
    const year = Math.floor(index / 12);
    const month = (index % 12) + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(
      Math.min(day, daysInMonth(year, month)),
    ).padStart(2, '0')}`;
    if (date >= cycle.start && date <= cycle.end) {
      return date;
    }
  }
  return undefined;
}

function statusFrom(
  stored: BillMonth | undefined,
  paidRows: TransactionRow[],
  fallback: BillStatus,
): BillStatus {
  if (stored?.status === 'skipped') {
    return 'skipped';
  }
  if (paidRows.length > 0) {
    return 'paid';
  }
  if (stored?.status === 'paid' || stored?.status === 'paid_outside') {
    // A linked payment the user later deleted still says it was paid.
    return 'paidOutside';
  }
  if (stored?.status === 'not_paid') {
    return 'notPaid';
  }
  return fallback;
}

function paidAmount(
  status: BillStatus,
  paidRows: TransactionRow[],
  stored: BillMonth | undefined,
  planned: number,
): number | undefined {
  if (status === 'paid') {
    return roundMoney(paidRows.reduce((sum, row) => sum + row.amount, 0));
  }
  if (status === 'paidOutside') {
    return stored?.paidAmount ?? planned;
  }
  return undefined;
}

/** Expenses the user linked to a bill as its payment: bills, not day-to-day spending. */
export function billPaymentIds(billMonths: BillMonth[]): Set<string> {
  const ids = new Set<string>();
  for (const month of billMonths) {
    if (month.transactionId) {
      ids.add(month.transactionId);
    }
  }
  return ids;
}

/**
 * Every monthly bill as it stands in `cycle`: ledger series, bills still
 * waiting for their first date, and earlier cycles' unpaid bills carried in.
 */
export function cycleBills(
  rows: TransactionRow[],
  cycle: CycleRange,
  pending: PendingBill[] = [],
  billMonths: BillMonth[] = [],
): CycleBill[] {
  const stored = new Map<string, BillMonth>();
  for (const month of billMonths) {
    stored.set(`${month.billKey}|${month.cycleStart}`, month);
  }
  const byId = new Map(rows.map(row => [row.id, row]));
  const linkedRow = (month: BillMonth | undefined) =>
    month?.transactionId ? byId.get(month.transactionId) : undefined;
  const inCycle = (date: string) => date >= cycle.start && date <= cycle.end;

  const series = new Map<string, TransactionRow[]>();
  for (const row of rows) {
    if (!isBillRow(row)) {
      continue;
    }
    const rootId = isSeriesStart(row) ? row.id : recurringRootId(row);
    if (!rootId) {
      continue;
    }
    series.set(rootId, [...(series.get(rootId) ?? []), row]);
  }

  const bills: CycleBill[] = [];
  for (const [rootId, list] of series) {
    const root = list.find(row => row.id === rootId);
    // A bill picked at sign-up keeps the ref it waited under, so an answer
    // given then still finds it once it is in the ledger.
    const month =
      stored.get(`${rootId}|${cycle.start}`) ??
      (root?.externalRef ? stored.get(`${root.externalRef}|${cycle.start}`) : undefined);
    const linked = linkedRow(month);
    const paidRows = list.filter(row => inCycle(calendarDateISO(row.transactionDate)));
    if (linked && !paidRows.includes(linked)) {
      paidRows.push(linked);
    }
    const dates = list.map(row => calendarDateISO(row.transactionDate)).sort();
    const ended = !root || !root.isRecurring;
    const latest = list.reduce((a, b) =>
      calendarDateISO(b.transactionDate) > calendarDateISO(a.transactionDate) ? b : a,
    );
    const first = root ? calendarDateISO(root.transactionDate) : dates[0];
    const day = Number(first.slice(8, 10));
    const planned = !ended && root ? root.amount : latest.amount;
    const status = statusFrom(month, paidRows, 'upcoming');
    // A stopped series still owes what it said it owed, and keeps what it paid.
    if (ended && (status === 'upcoming' || status === 'skipped')) {
      continue;
    }
    const due = first <= cycle.end || month !== undefined;
    bills.push({
      key: `${rootId}@${cycle.start}`,
      billKey: rootId,
      cycleStart: cycle.start,
      origin: 'ledger',
      label: latest.description || latest.merchant || root?.description || root?.merchant || 'Monthly bill',
      planned,
      paid: paidAmount(status, paidRows, month, planned),
      status,
      day,
      dueDate: dueDateInCycle(day, cycle),
      dueThisCycle: due,
      ...(ended ? {ended: true} : {}),
      rowIds: paidRows.map(row => row.id),
      stored: month !== undefined,
    });
  }

  for (const bill of pending) {
    const month = stored.get(`${bill.key}|${cycle.start}`);
    const startsLater = bill.date > cycle.end;
    const answeredHere = (answer?: string) =>
      answer !== undefined && answer >= cycle.start && answer <= cycle.end && startsLater;
    // Older accounts said "paid" before sign-up with no cycle start to check.
    const paidBefore =
      bill.paidSince !== undefined && bill.paidSince <= cycle.end && startsLater;
    const notPaid = answeredHere(bill.notPaidSince);
    const linked = linkedRow(month);
    const paidRows = linked ? [linked] : [];
    const fallback: BillStatus = paidBefore ? 'paidOutside' : notPaid ? 'notPaid' : 'upcoming';
    const status = statusFrom(month, paidRows, fallback);
    const day = Number(bill.date.slice(8, 10));
    bills.push({
      key: `${bill.key}@${cycle.start}`,
      billKey: bill.key,
      cycleStart: cycle.start,
      origin: 'scheduled',
      label: bill.label,
      planned: bill.amount,
      paid: paidAmount(status, paidRows, month, bill.amount),
      status,
      day,
      dueDate: dueDateInCycle(day, cycle),
      dueThisCycle: !startsLater || paidBefore || notPaid || month !== undefined,
      rowIds: paidRows.map(row => row.id),
      stored: month !== undefined,
    });
  }

  for (const month of billMonths) {
    if (month.cycleStart >= cycle.start) {
      continue;
    }
    const settledHere = month.settledOn !== null && inCycle(month.settledOn);
    if (!(month.status === 'not_paid' && month.settledOn === null) && !settledHere) {
      continue;
    }
    const linked = linkedRow(month);
    const paidRows = linked ? [linked] : [];
    const status = statusFrom(month, paidRows, 'notPaid');
    bills.push({
      key: `${month.billKey}@${month.cycleStart}`,
      billKey: month.billKey,
      cycleStart: month.cycleStart,
      origin: 'carried',
      label: month.label || 'Monthly bill',
      planned: month.plannedAmount,
      paid: paidAmount(status, paidRows, month, month.plannedAmount),
      status,
      carried: true,
      // Listed first, ahead of this cycle's own bills.
      day: 0,
      dueThisCycle: true,
      rowIds: paidRows.map(row => row.id),
      stored: true,
    });
  }

  return bills.sort(
    (a, b) => Number(Boolean(b.carried)) - Number(Boolean(a.carried)) || a.day - b.day,
  );
}

/** The bills a cycle's budget holds: due in it, or carried into it. */
export function billsDue(bills: CycleBill[]): CycleBill[] {
  return bills.filter(bill => bill.dueThisCycle);
}

/** A normal month's bills at their planned amounts: what a plan is checked against. */
export function plannedBillTotal(bills: CycleBill[]): number {
  return roundMoney(
    bills.reduce(
      (sum, bill) => (bill.ended || bill.carried ? sum : sum + Math.max(0, bill.planned)),
      0,
    ),
  );
}

// ---------------------------------------------------------------------------
// Storage

function fromRow(row: BillMonthRow): BillMonth {
  const paid = row.paid_amount === null ? null : Number(row.paid_amount);
  return {
    billKey: row.bill_key,
    cycleStart: row.cycle_start.slice(0, 10),
    status: row.status,
    label: row.label ?? '',
    plannedAmount: Number(row.planned_amount) || 0,
    paidAmount: paid !== null && Number.isFinite(paid) ? paid : null,
    transactionId: row.transaction_id,
    settledOn: row.settled_on ? row.settled_on.slice(0, 10) : null,
  };
}

/** Every bill status the user set; empty (and unavailable) before the database has the table. */
export async function loadBillMonths(): Promise<{available: boolean; months: BillMonth[]}> {
  const {data, error} = await supabase.from('bill_months').select('*');
  if (isMissingSchema(error)) {
    return {available: false, months: []};
  }
  if (error) {
    throw new Error(dataErrorMessage(error));
  }
  return {available: true, months: (data ?? []).map(row => fromRow(row as BillMonthRow))};
}

async function saveBillMonth(
  bill: Pick<CycleBill, 'billKey' | 'cycleStart' | 'label' | 'planned'>,
  status: BillMonthStatus,
  patch: {paidAmount?: number | null; transactionId?: string | null; settledOn?: string | null} = {},
) {
  const {error} = await supabase.from('bill_months').upsert(
    {
      bill_key: bill.billKey,
      cycle_start: bill.cycleStart,
      status,
      label: bill.label,
      planned_amount: roundMoney(Math.max(0, bill.planned)),
      paid_amount: patch.paidAmount ?? null,
      transaction_id: patch.transactionId ?? null,
      settled_on: patch.settledOn ?? null,
      updated_at: new Date().toISOString(),
    },
    {onConflict: 'user_id,bill_key,cycle_start'},
  );
  if (error) {
    throw new Error(
      isMissingSchema(error)
        ? 'Bill status needs the latest Paisa update on the server. Try again later.'
        : dataErrorMessage(error),
    );
  }
}

/** Settled now, when it was carried in from an earlier cycle. */
function settled(bill: CycleBill, today: string): string | null {
  return bill.origin === 'carried' ? today : null;
}

/** Logs the bill as paid today, at `amount`, and links the payment to it. */
export async function markBillPaid(
  bill: CycleBill,
  amount: number,
  today: string,
  categoryId: string | null,
): Promise<TransactionRow> {
  const row = await createTransaction({
    type: 'expense',
    amount: roundMoney(amount),
    categoryId,
    description: bill.label,
    transactionDate: today,
    kind: 'regular',
  });
  try {
    await saveBillMonth(bill, 'paid', {
      paidAmount: row.amount,
      transactionId: row.id,
      settledOn: settled(bill, today),
    });
  } catch (error) {
    // The payment must not count twice, as a bill and as spending.
    await deleteTransaction(row.id).catch(() => {});
    throw error;
  }
  return row;
}

/** An expense already logged (a UPI payment, say) is this bill's payment. */
export async function linkBillPayment(bill: CycleBill, row: TransactionRow, today: string) {
  await saveBillMonth(bill, 'paid', {
    paidAmount: row.amount,
    transactionId: row.id,
    settledOn: settled(bill, today),
  });
}

/** Paid where Paisa does not see it. */
export async function markBillPaidOutside(bill: CycleBill, today: string, amount?: number) {
  await saveBillMonth(bill, 'paid_outside', {
    paidAmount: amount === undefined ? null : roundMoney(amount),
    settledOn: settled(bill, today),
  });
}

/**
 * Not paid yet: it stays reserved and its due-day copy is not added. A copy
 * already added this cycle is removed, since it was never really paid; the
 * series' first row is the bill itself and is never removed.
 */
export async function markBillNotPaid(bill: CycleBill, rows: TransactionRow[]) {
  await saveBillMonth(bill, 'not_paid');
  const copies = rows.filter(
    row => bill.rowIds.includes(row.id) && row.id !== bill.billKey && recurringRootId(row) === bill.billKey,
  );
  for (const copy of copies) {
    await deleteTransaction(copy.id);
  }
}

/** A carried bill that is not owed after all: its reserved money is free again. */
export async function dismissCarriedBill(bill: CycleBill, today: string) {
  await saveBillMonth(bill, 'skipped', {settledOn: today});
}

/** Back to the usual: added on its due day. */
export async function clearBillMonth(bill: Pick<CycleBill, 'billKey' | 'cycleStart'>) {
  const {error} = await supabase
    .from('bill_months')
    .delete()
    .eq('bill_key', bill.billKey)
    .eq('cycle_start', bill.cycleStart);
  if (error && !isMissingSchema(error)) {
    throw new Error(dataErrorMessage(error));
  }
}

/**
 * Bills still unpaid when their cycle closed, written down so they carry
 * into the next cycle (a bill the user answered "not yet" for at sign-up has
 * no row of its own until then).
 */
export async function recordUnpaidBills(bills: CycleBill[]) {
  for (const bill of bills) {
    if (bill.status === 'notPaid' && !bill.stored && !bill.carried) {
      await saveBillMonth(bill, 'not_paid');
    }
  }
}

/** A removed bill no longer carries: its unpaid months are dismissed. */
export async function dismissUnpaidFor(billKeys: string[], months: BillMonth[], today: string) {
  for (const month of months) {
    if (billKeys.includes(month.billKey) && month.status === 'not_paid' && month.settledOn === null) {
      await saveBillMonth(
        {billKey: month.billKey, cycleStart: month.cycleStart, label: month.label, planned: month.plannedAmount},
        'skipped',
        {settledOn: today},
      );
    }
  }
}

/**
 * Whether the due-day copy for a series is to be added: not when the user
 * set how the bill stands in that cycle themselves.
 */
export function copySkipper(
  months: BillMonth[],
  cycleStartOf: (date: string) => string,
): (rootId: string, rootRef: string | null, date: string) => boolean {
  const keys = new Set(months.map(month => `${month.billKey}|${month.cycleStart}`));
  return (rootId, rootRef, date) => {
    const start = cycleStartOf(date);
    return keys.has(`${rootId}|${start}`) || (rootRef !== null && keys.has(`${rootRef}|${start}`));
  };
}
