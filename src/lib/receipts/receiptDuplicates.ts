// Keeps one purchase from landing in the ledger twice: once from scanning
// the same receipt again, and once from a receipt for a payment that is
// already there (typed in by hand, or saved by UPI auto-tracking).

import {MoneyFlow} from '../supabase/database.types';
import {
  calendarDateISO,
  isLedgerSpecial,
  TransactionRow,
} from '../transactionsStore';

export const RECEIPT_REF_PREFIX = 'receipt:';

/**
 * - exact: this receipt (same day, amount, direction and merchant) was saved before
 * - likely: same day and amount, and a merchant name that matches
 * - possible: same amount within a day either side, merchant unknown or different
 */
export type DuplicateStrength = 'exact' | 'likely' | 'possible';

export type DuplicateMatch = {
  row: TransactionRow;
  strength: DuplicateStrength;
};

export type ReceiptIdentity = {
  type: MoneyFlow;
  amountCents: number;
  /** `YYYY-MM-DD` */
  date: string;
  merchant: string | null;
};

const NAME_NOISE = new Set([
  'the',
  'and',
  'pvt',
  'private',
  'ltd',
  'limited',
  'llp',
  'inc',
  'co',
  'company',
  'india',
  'store',
  'stores',
  'shop',
  'retail',
  'enterprises',
]);

function nameTokens(name: string | null | undefined): string[] {
  // Punctuation joins rather than splits, so "D-Mart" and "DMart" agree.
  return (name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, '')
    .split(/\s+/)
    .filter(token => token.length > 0 && !NAME_NOISE.has(token));
}

/** Lowercase letters and digits only, the noise words dropped. */
export function merchantKey(name: string | null | undefined): string {
  return nameTokens(name).join('').slice(0, 32);
}

export function merchantsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const left = nameTokens(a);
  const right = nameTokens(b);
  if (!left.length || !right.length) {
    return false;
  }
  const joinedA = left.join('');
  const joinedB = right.join('');
  if (
    Math.min(joinedA.length, joinedB.length) >= 3 &&
    (joinedA.includes(joinedB) || joinedB.includes(joinedA))
  ) {
    return true;
  }
  const setB = new Set(right);
  const shared = left.filter(token => setB.has(token)).length;
  const union = new Set([...left, ...right]).size;
  return shared / union >= 0.5;
}

/**
 * The receipt's dedupe key, saved as the row's `external_ref`. The database
 * keeps (user, external_ref) unique, so saving the same receipt twice fails
 * even from two devices. It is built from what the user confirmed, not from
 * the raw scan, so a rescan with a slightly different read still matches once
 * corrected. `salt` gives a deliberate second copy its own key.
 */
export function receiptFingerprint(
  identity: ReceiptIdentity,
  salt?: string,
): string {
  const base = `${RECEIPT_REF_PREFIX}${identity.date}:${identity.type}:${
    identity.amountCents
  }:${merchantKey(identity.merchant) || 'unknown'}`;
  return salt ? `${base}:${salt}` : base;
}

function dayGap(a: string, b: string): number {
  const toUtc = (iso: string) => {
    const [y, m, d] = calendarDateISO(iso).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.abs(toUtc(a) - toUtc(b)) / 86_400_000;
}

const RANK: Record<DuplicateStrength, number> = {
  exact: 0,
  likely: 1,
  possible: 2,
};

/** Rows already in the ledger that may be this receipt, strongest first. */
export function findReceiptDuplicates(
  identity: ReceiptIdentity,
  rows: TransactionRow[],
): DuplicateMatch[] {
  const fingerprint = receiptFingerprint(identity);
  const matches: DuplicateMatch[] = [];
  for (const row of rows) {
    if (isLedgerSpecial(row)) {
      continue;
    }
    const ref = row.externalRef ?? '';
    if (ref === fingerprint || ref.startsWith(`${fingerprint}:`)) {
      matches.push({row, strength: 'exact'});
      continue;
    }
    if (
      row.type !== identity.type ||
      Math.abs(Math.round(row.amount * 100) - identity.amountCents) > 1
    ) {
      continue;
    }
    const gap = dayGap(row.transactionDate, identity.date);
    if (gap > 1) {
      continue;
    }
    const sameName =
      merchantsMatch(row.merchant, identity.merchant) ||
      merchantsMatch(row.description, identity.merchant);
    matches.push({
      row,
      strength: gap === 0 && sameName ? 'likely' : 'possible',
    });
  }
  return matches.sort((a, b) => RANK[a.strength] - RANK[b.strength]);
}
