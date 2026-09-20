import {buildPaisaMonthSummary} from '../src/features/paisaAI/paisaMonth';
import {CategoryRow} from '../src/lib/categoriesStore';
import {TransactionRow} from '../src/lib/transactionsStore';

const dining: CategoryRow = {
  id: 'cat-dining',
  userId: null,
  name: 'Dining',
  icon: 'utensils',
  color: '#E4573D',
  type: 'expense',
  slug: 'dining',
};

const shopping: CategoryRow = {
  id: 'cat-shopping',
  userId: null,
  name: 'Shopping',
  icon: 'bag',
  color: '#7A6BC4',
  type: 'expense',
  slug: 'shopping',
};

function tx(
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'categoryId' | 'transactionDate'>,
): TransactionRow {
  return {
    userId: 'user-1',
    description: null,
    merchant: null,
    paymentMethod: 'UPI',
    notes: null,
    isRecurring: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildPaisaMonthSummary', () => {
  const now = new Date(2026, 8, 20);

  it('totals this month, compares to last month, and fills four tiles', () => {
    const rows = [
      tx({
        id: '1',
        type: 'expense',
        amount: 3200,
        categoryId: 'cat-dining',
        transactionDate: '2026-09-04',
      }),
      tx({
        id: '2',
        type: 'expense',
        amount: 2480,
        categoryId: 'cat-shopping',
        transactionDate: '2026-09-08',
      }),
      tx({
        id: '3',
        type: 'expense',
        amount: 6400,
        categoryId: 'cat-dining',
        transactionDate: '2026-08-12',
      }),
    ];

    const summary = buildPaisaMonthSummary(rows, [dining, shopping], 20000, 'month', now);

    expect(summary.spent).toBe(5680);
    expect(summary.budget).toBe(20000);
    expect(summary.ratio).toBeCloseTo(5680 / 20000);
    expect(summary.vsLastPct).toBe(-11);
    expect(summary.tiles).toHaveLength(4);
    expect(summary.tiles[0].label).toBe('Dining');
    expect(summary.tiles[0].amount).toBe(3200);
  });
});
