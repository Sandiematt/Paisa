import {categoryForSlug, loadCategories} from './categoriesStore';
import {supabase} from './supabase/client';
import {Database, MoneyFlow} from './supabase/database.types';
import {dataErrorMessage} from './supabase/errors';

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
  isRecurring: boolean;
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
  isRecurring?: boolean;
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

export const OPENING_BALANCE_NOTE = 'opening_balance';
export const BALANCE_ADJUSTMENT_NOTE = 'balance_adjustment';

function asAmount(value: number | string | null): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value: number): number {
  return Number(value.toFixed(2));
}

export function isOpeningBalance(row: {notes: string | null}): boolean {
  return row.notes === OPENING_BALANCE_NOTE;
}

export function isBalanceAdjustment(row: {notes: string | null}): boolean {
  return row.notes === BALANCE_ADJUSTMENT_NOTE;
}

export function isLedgerSpecial(row: {notes: string | null}): boolean {
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
  is_recurring?: boolean | null;
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
    isRecurring: Boolean(row.is_recurring),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, user_id, type, amount, category_id, description, merchant, transaction_date, payment_method, notes, is_recurring, created_at, updated_at';

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
      is_recurring: input.isRecurring ?? false,
    })
    .select(SELECT_COLUMNS)
    .single();

  if (error || !data) {
    throw new Error(dataErrorMessage(error));
  }

  return mapRow(data);
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

export async function seedOpeningBalance(amount: number): Promise<boolean> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return false;
  }

  const {data: marked, error: markedError} = await supabase
    .from('transactions')
    .select('id')
    .eq('notes', OPENING_BALANCE_NOTE)
    .limit(1)
    .maybeSingle();

  if (markedError) {
    throw new Error(dataErrorMessage(markedError));
  }
  if (marked) {
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
      transactionDate: localDateISO(),
      paymentMethod: 'Wallet',
      notes: OPENING_BALANCE_NOTE,
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
    notes: BALANCE_ADJUSTMENT_NOTE,
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
