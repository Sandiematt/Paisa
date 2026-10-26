import {parseReceipt} from '../src/lib/receipts/parseReceipt';
import {
  buildReceiptMergePatch,
  buildReceiptTransaction,
  centsToInput,
  selectedTotalCents,
  summarizeItems,
} from '../src/lib/receipts/receiptTransaction';
import {ReceiptLineItem} from '../src/lib/receipts/types';
import {TransactionRow} from '../src/lib/transactionsStore';

const input = {
  type: 'expense' as const,
  amount: '722',
  merchant: ' DMart ',
  date: '2026-10-24',
  categoryId: 'cat-groceries',
  categoryName: 'Groceries',
  note: '  Milk, Bread ',
  paymentMethod: 'UPI',
};

function item(
  id: string,
  amountCents: number,
  flow: 'debit' | 'credit' = 'debit',
): ReceiptLineItem {
  return {
    id,
    description: id,
    quantity: null,
    unitCents: null,
    amountCents,
    flow,
  };
}

describe('buildReceiptTransaction', () => {
  it('builds a receipt_scan row keyed for dedupe', () => {
    expect(buildReceiptTransaction(input)).toEqual({
      ok: true,
      payload: {
        type: 'expense',
        amount: 722,
        categoryId: 'cat-groceries',
        description: 'DMart',
        merchant: 'DMart',
        transactionDate: '2026-10-24',
        paymentMethod: 'UPI',
        notes: 'Milk, Bread',
        kind: 'regular',
        isRecurring: false,
        source: 'receipt_scan',
        externalRef: 'receipt:2026-10-24:expense:72200:dmart',
      },
    });
  });

  it('falls back to the category name when no merchant was read', () => {
    const result = buildReceiptTransaction({...input, merchant: '  '});
    expect(result).toMatchObject({
      ok: true,
      payload: {
        merchant: 'Groceries',
        externalRef: 'receipt:2026-10-24:expense:72200:unknown',
      },
    });
  });

  it('salts the key of a deliberate second copy', () => {
    const result = buildReceiptTransaction({...input, duplicateSalt: '42'});
    expect(result).toMatchObject({
      payload: {externalRef: 'receipt:2026-10-24:expense:72200:dmart:42'},
    });
  });

  it.each(['', '0', 'abc', '1.234'])('rejects amount %p', amount => {
    expect(buildReceiptTransaction({...input, amount}).ok).toBe(false);
  });

  it('rejects a missing date', () => {
    expect(buildReceiptTransaction({...input, date: ''}).ok).toBe(false);
  });
});

describe('buildReceiptMergePatch', () => {
  const upiRow = {
    id: 'r1',
    merchant: 'PhonePe',
    description: 'PhonePe',
    categoryId: null,
    notes: null,
  } as TransactionRow;

  it('fills in who was paid, the category and a note, never the amount or date', () => {
    expect(buildReceiptMergePatch(upiRow, input)).toEqual({
      merchant: 'DMart',
      description: 'DMart',
      categoryId: 'cat-groceries',
      notes: 'Milk, Bread',
    });
  });

  it('keeps a category and note the row already has', () => {
    expect(
      buildReceiptMergePatch(
        {...upiRow, categoryId: 'cat-x', notes: 'mine'},
        input,
      ),
    ).toEqual({merchant: 'DMart', description: 'DMart'});
  });
});

describe('selectedTotalCents', () => {
  const items = [item('a', 10000), item('b', 30000)];

  it('is items plus extras when everything is ticked', () => {
    expect(selectedTotalCents(items, 4000, new Set())).toBe(44000);
  });

  it('gives ticked items their share of the extras', () => {
    // 100 of 400 in items, so a quarter of the 40 in tax.
    expect(selectedTotalCents(items, 4000, new Set(['b']))).toBe(11000);
  });

  it('nets credits and is null without items', () => {
    expect(
      selectedTotalCents(
        [item('a', 10000), item('r', 25000, 'credit')],
        0,
        new Set(),
      ),
    ).toBe(-15000);
    expect(selectedTotalCents([], 100, new Set())).toBeNull();
  });

  it('adds up exactly for a parsed receipt', () => {
    const receipt = parseReceipt(
      [
        'Cafe Mocha',
        'Latte        180.00',
        'Sandwich     220.00',
        'Brownie      100.00',
        'GST 5%        25.00',
        'Total        525.00',
      ],
      {today: '2026-10-26'},
    );
    expect(receipt.check).toEqual({status: 'matched'});
    expect(
      selectedTotalCents(receipt.lineItems, receipt.extrasCents, new Set()),
    ).toBe(52500);
    const sandwich = receipt.lineItems[1].id;
    // 180 + 100 = 280, plus 280/500 of 25 in tax = 14.
    expect(
      selectedTotalCents(
        receipt.lineItems,
        receipt.extrasCents,
        new Set([sandwich]),
      ),
    ).toBe(29400);
  });
});

describe('summarizeItems', () => {
  it('lists purchased items and counts the rest within the limit', () => {
    const items = [
      item('Amul Milk', 1),
      item('Brown Bread', 1),
      item('Return: Mug', 1, 'credit'),
      item('Basmati Rice', 1),
    ];
    expect(summarizeItems(items)).toBe('Amul Milk, Brown Bread, Basmati Rice');
    expect(summarizeItems(items, 30)).toBe('Amul Milk, Brown Bread +1 more');
    expect(summarizeItems([])).toBe('');
  });
});

describe('centsToInput', () => {
  it.each([
    [72200, '722'],
    [84950, '849.50'],
    [5, '0.05'],
  ])('%d → %s', (cents, text) => {
    expect(centsToInput(cents)).toBe(text);
  });
});
