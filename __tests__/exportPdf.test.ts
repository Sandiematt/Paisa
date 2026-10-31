import {pdfText, transactionsToPdf} from '../src/lib/exportPdf';
import {TransactionRow} from '../src/lib/transactionsStore';

jest.mock('../src/lib/supabase/client', () => ({supabase: {}}));
jest.mock('expo-file-system', () => ({File: jest.fn(), Paths: {}}));
jest.mock('expo-sharing', () => ({}));

function tx(
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'transactionDate'> &
    Partial<TransactionRow>,
): TransactionRow {
  return {
    userId: 'user-1',
    categoryId: null,
    description: null,
    merchant: null,
    paymentMethod: null,
    notes: null,
    kind: 'regular',
    isRecurring: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

const names = new Map([['cat-food', 'Dining']]);
const meta = {currency: 'INR', title: 'October 2026', generatedOn: '30 Oct 2026'};

/** Every object the cross-reference table points at must start right there. */
function expectValidXref(pdf: string) {
  const start = Number(pdf.match(/startxref\n(\d+)\n%%EOF\n$/)![1]);
  expect(pdf.slice(start).startsWith('xref\n')).toBe(true);
  const [, count] = pdf.slice(start).match(/^xref\n0 (\d+)\n/)!;
  const entries = pdf.slice(start).split('\n').slice(3, 3 + Number(count) - 1);
  entries.forEach((entry, index) => {
    expect(entry).toMatch(/^\d{10} 00000 n $/);
    expect(pdf.slice(Number(entry.slice(0, 10))).startsWith(`${index + 1} 0 obj`)).toBe(true);
  });
}

describe('transactionsToPdf', () => {
  it('writes a valid PDF with a summary and one row per transaction', () => {
    const pdf = transactionsToPdf(
      [
        tx({id: 'salary', type: 'income', amount: 25000, transactionDate: '2026-10-01', description: 'Salary'}),
        tx({id: 'lunch', type: 'expense', amount: 1234.5, transactionDate: '2026-10-12', merchant: 'Cafe (Indiranagar)', categoryId: 'cat-food'}),
      ],
      names,
      meta,
    );
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expectValidXref(pdf);
    expect(pdf).toContain('/Count 1');
    expect(pdf).toContain('(October 2026)');
    expect(pdf).toContain('(Cafe \\(Indiranagar\\))');
    expect(pdf).toContain('(Dining)');
    expect(pdf).toContain('(-1,234.50)');
    expect(pdf).toContain('(25,000.00)');
    expect(pdf).toContain('(Income 25,000.00    Spent 1,234.50    Net 23,765.50    2 transactions)');
    expect(pdf).toContain('(Page 1 of 1)');
  });

  it('runs onto more pages, numbering each', () => {
    const rows = Array.from({length: 120}, (_, index) =>
      tx({id: `t${index}`, type: 'expense', amount: 10, transactionDate: '2026-10-05', description: `Item ${index}`}),
    );
    const pdf = transactionsToPdf(rows, names, meta);
    expectValidXref(pdf);
    expect(pdf).toContain('/Count 3');
    expect(pdf).toContain('(Page 3 of 3)');
    expect(pdf).toContain('(Item 119)');
  });

  it('leaves opening balance and adjustments out of the totals', () => {
    const pdf = transactionsToPdf(
      [
        tx({id: 'open', type: 'income', amount: 5000, transactionDate: '2026-10-01', kind: 'opening_balance'}),
        tx({id: 'food', type: 'expense', amount: 200, transactionDate: '2026-10-02'}),
      ],
      names,
      meta,
    );
    expect(pdf).toContain('(Income 0.00    Spent 200.00    Net -200.00    1 transaction)');
    expect(pdf).toContain('(Opening balance)');
  });
});

describe('pdfText', () => {
  it('keeps to the built-in font and escapes PDF syntax', () => {
    expect(pdfText('₹500 – rent ‘Oct’ \\ (x)')).toBe('Rs 500 - rent \'Oct\' \\\\ \\(x\\)');
    expect(pdfText('चाय')).toBe('???');
  });
});
