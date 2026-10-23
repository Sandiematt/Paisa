/**
 * Pure helpers for the "export this month" flow. No runtime imports so they
 * stay trivially testable.
 */

type DatedRow = {transactionDate: string; kind: string};

/** `YYYY-MM` for a local date. */
export function monthKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

/**
 * Real transactions dated in the same calendar month as `month`. Opening
 * balance and balance adjustment rows are ledger bookkeeping, not
 * transactions, so they are left out.
 */
export function transactionsInMonth<T extends DatedRow>(
  rows: readonly T[],
  month: Date,
): T[] {
  const key = monthKey(month);
  return rows.filter(
    row =>
      row.kind !== 'opening_balance' &&
      row.kind !== 'balance_adjustment' &&
      row.transactionDate.slice(0, 7) === key,
  );
}
