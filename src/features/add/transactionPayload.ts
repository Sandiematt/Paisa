import {parseAmountInput} from '../../lib/formatMoney';
import type {
  NewTransaction,
  TransactionPatch,
} from '../../lib/transactionsStore';

export type TransactionFormInput = {
  amount: string;
  type: 'expense' | 'income';
  categoryId: string | null;
  categoryName: string | null;
  transactionDate: string;
  note: string;
  existing?: {
    merchant: string | null;
    description: string | null;
    paymentMethod: string | null;
    isRecurring: boolean;
  } | null;
  oldCategoryName?: string | null;
};

export type TransactionPayloadResult =
  | {ok: false; error: string}
  | {ok: true; mode: 'create'; payload: NewTransaction}
  | {ok: true; mode: 'update'; patch: TransactionPatch};

const AMOUNT_SHAPE = /^\d*\.?\d{0,2}$/;

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!AMOUNT_SHAPE.test(cleaned)) {
    return null;
  }
  const value = parseAmountInput(cleaned);
  return value > 0 ? value : null;
}

function followsCategory(
  value: string | null | undefined,
  oldCategoryName: string | null | undefined,
): boolean {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' || trimmed === oldCategoryName?.trim();
}

export function buildTransactionPayload(
  input: TransactionFormInput,
): TransactionPayloadResult {
  const amount = parseAmount(input.amount);
  if (amount === null) {
    return {
      ok: false,
      error: 'Enter an amount above 0 with at most 2 decimals.',
    };
  }
  const name = input.categoryName;
  const base = {
    type: input.type,
    amount,
    categoryId: input.categoryId,
    transactionDate: input.transactionDate,
    notes: input.note.trim() || null,
  };
  const {existing} = input;
  if (!existing) {
    return {
      ok: true,
      mode: 'create',
      payload: {...base, kind: 'regular', description: name, merchant: name},
    };
  }
  const old = input.oldCategoryName;
  return {
    ok: true,
    mode: 'update',
    patch: {
      ...base,
      description: followsCategory(existing.description, old)
        ? name
        : existing.description,
      merchant: followsCategory(existing.merchant, old)
        ? name
        : existing.merchant,
      paymentMethod: existing.paymentMethod,
      isRecurring: existing.isRecurring,
    },
  };
}
