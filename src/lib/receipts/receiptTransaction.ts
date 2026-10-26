import {parseAmount} from '../../features/add/transactionPayload';
import {MoneyFlow} from '../supabase/database.types';
import {
  DETECTED_NOTE_LIMIT,
  NewTransaction,
  TransactionPatch,
  TransactionRow,
} from '../transactionsStore';
import {itemsNetCents} from './parseReceipt';
import {receiptFingerprint} from './receiptDuplicates';
import {ReceiptLineItem} from './types';

/** What the user confirmed on the review screen. */
export type ReceiptReviewInput = {
  type: MoneyFlow;
  amount: string;
  merchant: string;
  /** `YYYY-MM-DD` */
  date: string;
  categoryId: string | null;
  categoryName: string | null;
  note: string;
  paymentMethod: string | null;
  /** Set when the user chose to save a second copy of a receipt already saved. */
  duplicateSalt?: string;
};

export type ReceiptTransactionResult =
  | {ok: false; error: string}
  | {ok: true; payload: NewTransaction};

export function buildReceiptTransaction(
  input: ReceiptReviewInput,
): ReceiptTransactionResult {
  const amount = parseAmount(input.amount);
  if (amount === null) {
    return {
      ok: false,
      error: 'Enter a total above 0 with at most 2 decimals.',
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return {ok: false, error: 'Pick the date on the receipt.'};
  }
  const merchant = input.merchant.trim() || input.categoryName || null;
  const amountCents = Math.round(amount * 100);
  return {
    ok: true,
    payload: {
      type: input.type,
      amount,
      categoryId: input.categoryId,
      description: merchant,
      merchant,
      transactionDate: input.date,
      paymentMethod: input.paymentMethod,
      notes: input.note.trim().slice(0, DETECTED_NOTE_LIMIT) || null,
      kind: 'regular',
      isRecurring: false,
      source: 'receipt_scan',
      externalRef: receiptFingerprint(
        {
          type: input.type,
          amountCents,
          date: input.date,
          merchant: input.merchant.trim() || null,
        },
        input.duplicateSalt,
      ),
    },
  };
}

/**
 * Folds a receipt into a row that already records the same payment (say, a
 * UPI payment auto-tracking saved as "PhonePe"): the amount, date and type
 * stay as they are, and the receipt fills in who was paid, the category and
 * a note where the row has none.
 */
export function buildReceiptMergePatch(
  row: TransactionRow,
  input: ReceiptReviewInput,
): TransactionPatch {
  const merchant = input.merchant.trim();
  const note = input.note.trim().slice(0, DETECTED_NOTE_LIMIT);
  const patch: TransactionPatch = {};
  if (merchant) {
    patch.merchant = merchant;
    patch.description = merchant;
  }
  if (!row.categoryId && input.categoryId) {
    patch.categoryId = input.categoryId;
  }
  if (!row.notes?.trim() && note) {
    patch.notes = note;
  }
  return patch;
}

/** "Milk, Bread, Eggs +2 more", within the note limit, for a starting note. */
export function summarizeItems(
  items: ReceiptLineItem[],
  limit = DETECTED_NOTE_LIMIT,
): string {
  const names = items
    .filter(item => item.flow === 'debit')
    .map(item => item.description);
  let text = '';
  for (let i = 0; i < names.length; i += 1) {
    const rest = names.length - i - 1;
    const next = text ? `${text}, ${names[i]}` : names[i];
    const suffix = rest > 0 ? ` +${rest} more` : '';
    if (`${next}${suffix}`.length > limit) {
      const left = names.length - i;
      return text ? `${text} +${left} more` : names[i].slice(0, limit);
    }
    text = next;
  }
  return text;
}

/**
 * What the ticked items come to, in signed cents (negative when credits win).
 * With every item ticked it is the items plus the receipt's extras (tax,
 * charges, discounts, round-off; see ParsedReceipt.extrasCents). With some
 * unticked (splitting a shared bill, dropping a misread line) the ticked
 * items carry their proportional share, so a ₹100 item on a bill with 10%
 * tax costs ₹110.
 */
export function selectedTotalCents(
  items: ReceiptLineItem[],
  extrasCents: number,
  excludedIds: ReadonlySet<string>,
): number | null {
  if (items.length === 0) {
    return null;
  }
  const allNet = itemsNetCents(items);
  const selected = items.filter(item => !excludedIds.has(item.id));
  const selectedNet = itemsNetCents(selected);
  if (selected.length === items.length) {
    return allNet + extrasCents;
  }
  if (allNet === 0) {
    return selectedNet;
  }
  return selectedNet + Math.round((extrasCents * selectedNet) / allNet);
}

/** Whole cents as the amount field's text: 72200 → "722", 84950 → "849.50". */
export function centsToInput(cents: number): string {
  const value = Math.abs(cents) / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
