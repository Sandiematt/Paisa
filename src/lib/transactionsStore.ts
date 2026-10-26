import {PendingTxn, UPI_APP_NAMES} from './autotrack/types';
import {categoryForSlug, loadCategories} from './categoriesStore';
import {supabase} from './supabase/client';
import {
  Database,
  MoneyFlow,
  TransactionKind,
  TransactionSource,
} from './supabase/database.types';
import {dataErrorMessage} from './supabase/errors';

export type {TransactionKind, TransactionSource};

export type TransactionRow = {
  id: string;
  userId: string;
  type: MoneyFlow;
  amount: number;
  categoryId: string | null;
  description: string | null;
  merchant: string | null;
  transactionDate: string;
  paymentMethod: string | null;
  notes: string | null;
  kind: TransactionKind;
  isRecurring: boolean;
  /** 'upi_auto' for payments saved by the UPI detector, 'receipt_scan' for scanned receipts. Absent means manual. */
  source?: TransactionSource;
  /** Dedupe key from the UPI detector or a receipt scan; null for manual rows. */
  externalRef?: string | null;
  upiRef?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewTransaction = {
  type: MoneyFlow;
  amount: number;
  categoryId: string | null;
  description?: string | null;
  merchant?: string | null;
  transactionDate: string;
  paymentMethod?: string | null;
  notes?: string | null;
  kind: TransactionKind;
  isRecurring?: boolean;
  source?: TransactionSource;
  externalRef?: string | null;
  upiRef?: string | null;
};

export type TransactionPatch = {
  type?: MoneyFlow;
  amount?: number;
  categoryId?: string | null;
  description?: string | null;
  merchant?: string | null;
  transactionDate?: string;
  paymentMethod?: string | null;
  notes?: string | null;
  isRecurring?: boolean;
};

function asAmount(value: number | string | null): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function isOpeningBalance(row: {kind: TransactionKind}): boolean {
  return row.kind === 'opening_balance';
}

export function isBalanceAdjustment(row: {kind: TransactionKind}): boolean {
  return row.kind === 'balance_adjustment';
}

export function isLedgerSpecial(row: {kind: TransactionKind}): boolean {
  return isOpeningBalance(row) || isBalanceAdjustment(row);
}

export function walletBalanceFrom(rows: TransactionRow[]): number {
  let balance = 0;
  for (const row of rows) {
    balance += row.type === 'income' ? row.amount : -row.amount;
  }
  return roundMoney(balance);
}

function mapRow(row: {
  id: string;
  user_id: string;
  type: MoneyFlow;
  amount: number | string;
  category_id: string | null;
  description: string | null;
  merchant: string | null;
  transaction_date: string;
  payment_method: string | null;
  notes: string | null;
  kind: TransactionKind;
  is_recurring?: boolean | null;
  source?: TransactionSource | null;
  external_ref?: string | null;
  upi_ref?: string | null;
  created_at: string;
  updated_at: string;
}): TransactionRow {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: asAmount(row.amount),
    categoryId: row.category_id,
    description: row.description,
    merchant: row.merchant,
    transactionDate: calendarDateISO(row.transaction_date),
    paymentMethod: row.payment_method,
    notes: row.notes,
    kind: row.kind,
    isRecurring: Boolean(row.is_recurring),
    source: row.source ?? 'manual',
    externalRef: row.external_ref ?? null,
    upiRef: row.upi_ref ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, user_id, type, amount, category_id, description, merchant, transaction_date, payment_method, notes, kind, is_recurring, source, external_ref, upi_ref, created_at, updated_at';

export async function loadTransactions(): Promise<TransactionRow[]> {
  const {data, error} = await supabase
    .from('transactions')
    .select(SELECT_COLUMNS)
    .order('transaction_date', {ascending: true})
    .order('created_at', {ascending: true});

  if (error) {
    throw new Error(dataErrorMessage(error));
  }

  return (data ?? []).map(mapRow);
}

export async function createTransaction(
  input: NewTransaction,
): Promise<TransactionRow> {
  const {data: sessionData, error: sessionError} =
    await supabase.auth.getUser();
  if (sessionError || !sessionData.user) {
    throw new Error('Sign in to save this transaction.');
  }

  const {data, error} = await supabase
    .from('transactions')
    .insert({
      user_id: sessionData.user.id,
      type: input.type,
      amount: input.amount,
      category_id: input.categoryId,
      description: input.description ?? null,
      merchant: input.merchant ?? null,
      transaction_date: input.transactionDate,
      payment_method: input.paymentMethod ?? null,
      notes: input.notes ?? null,
      kind: input.kind,
      is_recurring: input.isRecurring ?? false,
      source: input.source ?? 'manual',
      external_ref: input.externalRef ?? null,
      upi_ref: input.upiRef ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(dataErrorMessage(error));
  }

  return mapRow(data);
}

/** Same cap as the note field on Add transaction. */
export const DETECTED_NOTE_LIMIT = 100;

/**
 * Saves one payment found by the UPI detector. Returns the Supabase row id,
 * or null when there is nothing to point at (the user already deleted the row,
 * or the payment cannot be saved). Throws only when saving failed and should be
 * retried; any resolved result means the detection can be acknowledged, except
 * for a payment of unknown direction, which is never uploaded (the drain skips
 * it without an ack).
 *
 * Edits made in Paisa win: a first sync never overwrites an existing row, and
 * a later sync only fills in a note the row does not have yet.
 */
export async function upsertDetectedTransaction(
  pending: PendingTxn,
  userId: string,
): Promise<string | null> {
  if (pending.direction === 'UNKNOWN') {
    return null;
  }
  const note = pending.note?.trim().slice(0, DETECTED_NOTE_LIMIT) || null;

  // Only fills a note the row does not have yet.
  const addNote = async () => {
    if (!note) {
      return;
    }
    const {error} = await supabase
      .from('transactions')
      .update({notes: note})
      .eq('user_id', userId)
      .eq('external_ref', pending.externalRef)
      .is('notes', null);
    if (error) {
      throw new Error(dataErrorMessage(error));
    }
  };

  if (pending.alreadySynced) {
    await addNote();
    return pending.remoteId;
  }

  const amount = Number(pending.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const appName = UPI_APP_NAMES[pending.sourceApp];
  const name = pending.merchant?.trim() || appName || 'UPI payment';

  const {data, error} = await supabase
    .from('transactions')
    .upsert(
      {
        user_id: userId,
        type: pending.direction === 'CREDIT' ? 'income' : 'expense',
        amount,
        category_id: null,
        description: name,
        merchant: name,
        transaction_date: localDateISO(new Date(pending.detectedAtMillis)),
        payment_method: appName ?? 'UPI',
        notes: note,
        kind: 'regular',
        is_recurring: false,
        source: 'upi_auto',
        external_ref: pending.externalRef,
        upi_ref: pending.upiRef,
      },
      {onConflict: 'user_id,external_ref', ignoreDuplicates: true},
    )
    .select('id');
  if (error) {
    throw new Error(dataErrorMessage(error));
  }
  if (data && data.length > 0) {
    return data[0].id;
  }

  // The row already exists (an earlier attempt saved it but was not acked).
  const {data: existing, error: lookupError} = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('external_ref', pending.externalRef)
    .maybeSingle();
  if (lookupError) {
    throw new Error(dataErrorMessage(lookupError));
  }
  if (existing) {
    // That attempt may have predated the note; add it if the row has none.
    await addNote();
  }
  return existing?.id ?? null;
}

async function ledgerCategory(
  slug: 'opening' | 'adjustment_in' | 'adjustment_out',
  type: MoneyFlow,
) {
  const categories = await loadCategories();
  return (
    categoryForSlug(categories, slug, type) ??
    categoryForSlug(
      categories,
      type === 'income' ? 'other' : 'bills',
      type,
    )
  );
}

export function openingBalanceDate(dates: string[], today: string): string {
  let earliest = calendarDateISO(today);
  for (const value of dates) {
    const day = calendarDateISO(value);
    if (day < earliest) {
      earliest = day;
    }
  }
  return earliest;
}

export async function seedOpeningBalance(amount: number): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  const {data: marked, error: markedError} = await supabase
    .from('transactions')
    .select('id, transaction_date')
    .eq('kind', 'opening_balance')
    .limit(1)
    .maybeSingle();

  if (markedError) {
    throw new Error(dataErrorMessage(markedError));
  }

  const {data: earliest, error: earliestError} = await supabase
    .from('transactions')
    .select('transaction_date')
    .neq('kind', 'opening_balance')
    .order('transaction_date', {ascending: true})
    .limit(1)
    .maybeSingle();

  if (earliestError) {
    throw new Error(dataErrorMessage(earliestError));
  }

  const target = openingBalanceDate(
    earliest ? [earliest.transaction_date] : [],
    localDateISO(),
  );

  if (marked) {
    if (calendarDateISO(marked.transaction_date) > target) {
      const {error: moveError} = await supabase
        .from('transactions')
        .update({transaction_date: target})
        .eq('id', marked.id);
      if (moveError) {
        throw new Error(dataErrorMessage(moveError));
      }
    }
    return false;
  }

  const opening = await ledgerCategory('opening', 'income');

  try {
    await createTransaction({
      type: 'income',
      amount: roundMoney(amount),
      categoryId: opening?.id ?? null,
      description: 'Opening balance',
      merchant: 'Opening balance',
      transactionDate: target,
      paymentMethod: 'Wallet',
      kind: 'opening_balance',
    });
    return true;
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : '';
    if (/duplicate|unique/i.test(message)) {
      return false;
    }
    throw caught;
  }
}

export async function applyWalletAdjustment(
  targetBalance: number,
  currentBalance: number,
): Promise<boolean> {
  const delta = roundMoney(targetBalance - currentBalance);
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.01) {
    return false;
  }

  const type: MoneyFlow = delta > 0 ? 'income' : 'expense';
  const slug = type === 'income' ? 'adjustment_in' : 'adjustment_out';
  const category = await ledgerCategory(slug, type);

  await createTransaction({
    type,
    amount: Math.abs(delta),
    categoryId: category?.id ?? null,
    description: 'Balance adjustment',
    merchant: 'Balance adjustment',
    transactionDate: localDateISO(),
    paymentMethod: 'Wallet',
    kind: 'balance_adjustment',
  });
  return true;
}

export async function updateTransaction(
  id: string,
  patch: TransactionPatch,
): Promise<TransactionRow> {
  const payload: Database['public']['Tables']['transactions']['Update'] = {};
  if (patch.type !== undefined) {
    payload.type = patch.type;
  }
  if (patch.amount !== undefined) {
    payload.amount = patch.amount;
  }
  if (patch.categoryId !== undefined) {
    payload.category_id = patch.categoryId;
  }
  if (patch.description !== undefined) {
    payload.description = patch.description;
  }
  if (patch.merchant !== undefined) {
    payload.merchant = patch.merchant;
  }
  if (patch.transactionDate !== undefined) {
    payload.transaction_date = patch.transactionDate;
  }
  if (patch.paymentMethod !== undefined) {
    payload.payment_method = patch.paymentMethod;
  }
  if (patch.notes !== undefined) {
    payload.notes = patch.notes;
  }
  if (patch.isRecurring !== undefined) {
    payload.is_recurring = patch.isRecurring;
  }

  const {data, error} = await supabase
    .from('transactions')
    .update(payload)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(dataErrorMessage(error));
  }

  return mapRow(data);
}

export async function deleteTransaction(id: string): Promise<void> {
  const {error} = await supabase.from('transactions').delete().eq('id', id);
  if (error) {
    throw new Error(dataErrorMessage(error));
  }
}

export async function duplicateTransaction(
  row: TransactionRow,
): Promise<TransactionRow> {
  return createTransaction({
    type: row.type,
    amount: row.amount,
    categoryId: row.categoryId,
    description: row.description,
    merchant: row.merchant,
    transactionDate: row.transactionDate,
    paymentMethod: row.paymentMethod,
    notes: row.notes,
    kind: 'regular',
    isRecurring: row.isRecurring,
  });
}

export function localDateISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Calendar day `YYYY-MM-DD` from a date column or a full timestamp. */
export function calendarDateISO(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const fallback = new Date(value);
  if (Number.isNaN(fallback.getTime())) {
    return localDateISO();
  }
  return localDateISO(fallback);
}

export function dateFromCalendarISO(iso: string): Date {
  const stamp = calendarDateISO(iso);
  const [year, month, day] = stamp.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function sortLedger(rows: TransactionRow[]): TransactionRow[] {
  return [...rows].sort((a, b) => {
    if (a.transactionDate !== b.transactionDate) {
      return a.transactionDate < b.transactionDate ? -1 : 1;
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    return a.id < b.id ? -1 : 1;
  });
}

export function upsertLedgerRow(
  rows: TransactionRow[],
  row: TransactionRow,
): TransactionRow[] {
  return sortLedger([...rows.filter(item => item.id !== row.id), row]);
}

export function removeLedgerRow(
  rows: TransactionRow[],
  id: string,
): TransactionRow[] {
  return rows.filter(item => item.id !== id);
}
