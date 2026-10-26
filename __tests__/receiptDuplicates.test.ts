import {
  findReceiptDuplicates,
  merchantKey,
  merchantsMatch,
  receiptFingerprint,
} from '../src/lib/receipts/receiptDuplicates';
import {TransactionRow} from '../src/lib/transactionsStore';

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'row',
    userId: 'u1',
    type: 'expense',
    amount: 722,
    categoryId: null,
    description: null,
    merchant: null,
    transactionDate: '2026-10-24',
    paymentMethod: null,
    notes: null,
    kind: 'regular',
    isRecurring: false,
    source: 'manual',
    externalRef: null,
    upiRef: null,
    createdAt: '2026-10-24T13:00:00Z',
    updatedAt: '2026-10-24T13:00:00Z',
    ...overrides,
  };
}

const receipt = {
  type: 'expense' as const,
  amountCents: 72200,
  date: '2026-10-24',
  merchant: 'DMart Avenue Supermarts',
};

describe('merchant names', () => {
  it('normalises case, punctuation and company suffixes', () => {
    expect(merchantKey('D-Mart Pvt. Ltd.')).toBe('dmart');
    expect(merchantsMatch('DMART', 'D Mart Stores')).toBe(true);
    expect(merchantsMatch('Cafe Coffee Day', 'Coffee Day Cafe')).toBe(true);
    expect(merchantsMatch('Starbucks', 'Third Wave Coffee')).toBe(false);
    expect(merchantsMatch(null, 'DMart')).toBe(false);
  });
});

describe('receiptFingerprint', () => {
  it('is stable for the same confirmed details', () => {
    expect(receiptFingerprint(receipt)).toBe(
      'receipt:2026-10-24:expense:72200:dmartavenuesupermarts',
    );
    expect(
      receiptFingerprint({...receipt, merchant: 'DMART AVENUE SUPERMARTS'}),
    ).toBe(receiptFingerprint(receipt));
  });

  it('gives a deliberate second copy its own key', () => {
    expect(receiptFingerprint(receipt, '123')).toBe(
      `${receiptFingerprint(receipt)}:123`,
    );
  });
});

describe('findReceiptDuplicates', () => {
  it('finds the same receipt saved before, including a saved copy', () => {
    const ref = receiptFingerprint(receipt);
    const matches = findReceiptDuplicates(receipt, [
      row({id: 'a', externalRef: ref, source: 'receipt_scan'}),
      row({id: 'b', externalRef: `${ref}:999`, source: 'receipt_scan'}),
    ]);
    expect(matches.map(m => [m.row.id, m.strength])).toEqual([
      ['a', 'exact'],
      ['b', 'exact'],
    ]);
  });

  it('calls a same-day same-amount row from the same merchant likely', () => {
    const matches = findReceiptDuplicates(receipt, [
      row({id: 'a', merchant: 'DMart'}),
    ]);
    expect(matches).toEqual([expect.objectContaining({strength: 'likely'})]);
  });

  it('flags a UPI payment for the same amount a day apart as possible', () => {
    const matches = findReceiptDuplicates(receipt, [
      row({
        id: 'upi',
        merchant: 'PhonePe',
        source: 'upi_auto',
        transactionDate: '2026-10-25',
      }),
    ]);
    expect(matches).toEqual([
      expect.objectContaining({
        strength: 'possible',
        row: expect.objectContaining({id: 'upi'}),
      }),
    ]);
  });

  it('ignores other amounts, other days, the other direction and ledger rows', () => {
    const matches = findReceiptDuplicates(receipt, [
      row({id: 'amount', amount: 721}),
      row({id: 'days', transactionDate: '2026-10-21'}),
      row({id: 'type', type: 'income'}),
      row({id: 'opening', kind: 'opening_balance'}),
    ]);
    expect(matches).toEqual([]);
  });

  it('orders the strongest match first', () => {
    const matches = findReceiptDuplicates(receipt, [
      row({
        id: 'possible',
        merchant: 'Groceries',
        transactionDate: '2026-10-23',
      }),
      row({id: 'likely', merchant: 'Dmart'}),
      row({id: 'exact', externalRef: receiptFingerprint(receipt)}),
    ]);
    expect(matches.map(m => m.row.id)).toEqual(['exact', 'likely', 'possible']);
  });
});
