import {categoryForSlug, loadCategories} from './categoriesStore';
import {supabase} from './supabase/client';
import {MoneyFlow} from './supabase/database.types';
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
    transactionDate: row.transaction_date,
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  'id, user_id, type, amount, category_id, description, merchant, transaction_date, payment_method, notes, created_at, updated_at';

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

export function localDateISO(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
