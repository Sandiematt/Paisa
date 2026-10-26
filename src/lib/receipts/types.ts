import {MoneyFlow} from '../supabase/database.types';

/**
 * A purchase line adds to what was spent; a credit line (a return, refund,
 * or a printed discount against an item) takes away from it. Amounts are
 * always positive whole cents, the direction lives in `flow`.
 */
export type ReceiptLineFlow = 'debit' | 'credit';

export type ReceiptLineItem = {
  /** Stable within one parse, so the review screen can key and toggle rows. */
  id: string;
  description: string;
  quantity: number | null;
  unitCents: number | null;
  amountCents: number;
  flow: ReceiptLineFlow;
};

/** A printed line below the items: tax, a service charge, a discount, round-off. */
export type ReceiptAdjustmentKind = 'tax' | 'charge' | 'discount' | 'rounding';

export type ReceiptAdjustment = {
  label: string;
  kind: ReceiptAdjustmentKind;
  /** Signed: taxes and charges positive, discounts negative, round-off either. */
  cents: number;
};

export type ReceiptConfidence = 'high' | 'medium' | 'low';

export type ReceiptClassification = {
  type: MoneyFlow;
  confidence: ReceiptConfidence;
  /** Short, user-facing reasons, most important first. */
  reasons: string[];
};

/**
 * How the printed numbers agree with each other:
 *  - matched: items (or subtotal) plus adjustments equal the printed total
 *  - mismatch: they disagree by `differenceCents` (total minus computed)
 *  - total_only: a total was printed but no items could be read
 *  - computed: no total was printed; the amount comes from items/adjustments
 *  - none: no amounts at all
 */
export type ReceiptCheck =
  | {status: 'matched'}
  | {status: 'mismatch'; differenceCents: number}
  | {status: 'total_only'}
  | {status: 'computed'}
  | {status: 'none'};

export type ParsedReceipt = {
  merchant: string | null;
  /** Calendar day `YYYY-MM-DD`, or null when none was readable. */
  date: string | null;
  /** The printed grand total, unsigned, in cents. */
  totalCents: number | null;
  subtotalCents: number | null;
  lineItems: ReceiptLineItem[];
  adjustments: ReceiptAdjustment[];
  /**
   * Signed cents the adjustments add on top of the items: taxes left out
   * when the receipt's prices already include them, flipped on a return.
   */
  extrasCents: number;
  /** Cash, Card or UPI when the receipt says how it was paid. */
  paymentMethod: string | null;
  /**
   * The amount to save, unsigned, in cents: the printed total when there is
   * one, otherwise what the items and adjustments add up to.
   */
  amountCents: number | null;
  check: ReceiptCheck;
  classification: ReceiptClassification;
  /** Category id from the Add screen's grid (e.g. `groceries`), when obvious. */
  suggestedCategoryId: string | null;
  /** The OCR lines the parse was made from, for the "raw text" view. */
  rawLines: string[];
};
