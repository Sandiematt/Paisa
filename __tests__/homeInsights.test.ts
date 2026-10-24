import {
  daysToGo,
  daysToGoLabel,
  dayMonthLabel,
  greetingForHour,
  recentTransactions,
  relatedTransactions,
  savingsSeries,
  shortDateLabel,
  weeklySpendNudge,
} from '../src/features/home/homeInsights';
import {buildHomeReport} from '../src/features/home/homeReport';
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
const travel: CategoryRow = {
  id: 'cat-travel',
  userId: null,
  name: 'Travel',
  icon: 'plane',
  color: '#3D8AE4',
  type: 'expense',
  slug: 'travel',
};
const categories = [dining, travel];

function tx(
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'transactionDate'> &
    Partial<Pick<TransactionRow, 'categoryId' | 'kind' | 'createdAt'>>,
): TransactionRow {
  return {
    userId: 'user-1',
    categoryId: null,
    description: null,
    merchant: null,
    paymentMethod: 'Everyday',
    notes: null,
    kind: 'regular',
    isRecurring: false,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    ...partial,
  };
}

// Saturday 24 Oct 2026. This week is Mon 19..Sat 24; the same days last week
// are Mon 12..Sat 17.
const now = new Date(2026, 9, 24, 12, 0, 0);

describe('weeklySpendNudge', () => {
  it('reports spending under last week and names the category that fell most', () => {
    const rows = [
      tx({id: '1', type: 'expense', amount: 2000, categoryId: 'cat-dining', transactionDate: '2026-10-13'}),
      tx({id: '2', type: 'expense', amount: 500, categoryId: 'cat-travel', transactionDate: '2026-10-14'}),
      tx({id: '3', type: 'expense', amount: 700, categoryId: 'cat-dining', transactionDate: '2026-10-20'}),
      tx({id: '4', type: 'expense', amount: 400, categoryId: 'cat-travel', transactionDate: '2026-10-21'}),
    ];
    const nudge = weeklySpendNudge(rows, categories, now);
    expect(nudge).not.toBeNull();
    expect(nudge?.direction).toBe('under');
    expect(nudge?.amount).toBe(1400);
    expect(nudge?.thisWeek).toBe(1100);
    expect(nudge?.lastWeek).toBe(2500);
    expect(nudge?.category).toEqual({name: 'Dining', amount: 1300});
    expect(nudge?.key).toBe('2026-10-19');
  });

  it('reports spending over last week', () => {
    const rows = [
      tx({id: '1', type: 'expense', amount: 300, categoryId: 'cat-dining', transactionDate: '2026-10-13'}),
      tx({id: '2', type: 'expense', amount: 1500, categoryId: 'cat-travel', transactionDate: '2026-10-22'}),
    ];
    const nudge = weeklySpendNudge(rows, categories, now);
    expect(nudge?.direction).toBe('over');
    expect(nudge?.amount).toBe(1200);
    expect(nudge?.category).toEqual({name: 'Travel', amount: 1500});
  });

  it('only compares the days that have elapsed this week', () => {
    // Last Sunday (18th) is outside Mon-Sat, so it must not count.
    const rows = [
      tx({id: '1', type: 'expense', amount: 5000, transactionDate: '2026-10-18'}),
      tx({id: '2', type: 'expense', amount: 100, transactionDate: '2026-10-13'}),
      tx({id: '3', type: 'expense', amount: 150, transactionDate: '2026-10-20'}),
    ];
    const nudge = weeklySpendNudge(rows, categories, now);
    expect(nudge?.lastWeek).toBe(100);
    expect(nudge?.direction).toBe('over');
    expect(nudge?.amount).toBe(50);
  });

  it('ignores income, opening balance and adjustments', () => {
    const rows = [
      tx({id: '1', type: 'expense', amount: 200, transactionDate: '2026-10-13'}),
      tx({id: '2', type: 'income', amount: 9000, transactionDate: '2026-10-20'}),
      tx({id: '3', type: 'expense', amount: 9000, kind: 'balance_adjustment', transactionDate: '2026-10-20'}),
      tx({id: '4', type: 'expense', amount: 50, transactionDate: '2026-10-20'}),
    ];
    const nudge = weeklySpendNudge(rows, categories, now);
    expect(nudge?.thisWeek).toBe(50);
    expect(nudge?.direction).toBe('under');
  });

  it('is hidden without enough data', () => {
    expect(weeklySpendNudge([], categories, now)).toBeNull();
    // Nothing last week.
    expect(
      weeklySpendNudge(
        [tx({id: '1', type: 'expense', amount: 100, transactionDate: '2026-10-20'})],
        categories,
        now,
      ),
    ).toBeNull();
    // Nothing yet this week.
    expect(
      weeklySpendNudge(
        [tx({id: '1', type: 'expense', amount: 100, transactionDate: '2026-10-13'})],
        categories,
        now,
      ),
    ).toBeNull();
    // Identical spending.
    expect(
      weeklySpendNudge(
        [
          tx({id: '1', type: 'expense', amount: 100, transactionDate: '2026-10-13'}),
          tx({id: '2', type: 'expense', amount: 100, transactionDate: '2026-10-20'}),
        ],
        categories,
        now,
      ),
    ).toBeNull();
  });

  it('falls back to Uncategorized for unknown categories', () => {
    const rows = [
      tx({id: '1', type: 'expense', amount: 900, transactionDate: '2026-10-13'}),
      tx({id: '2', type: 'expense', amount: 100, transactionDate: '2026-10-20'}),
    ];
    expect(weeklySpendNudge(rows, categories, now)?.category?.name).toBe('Uncategorized');
  });
});

describe('daysToGo', () => {
  it('counts today through the end of the month', () => {
    expect(daysToGo('month', new Date(2026, 9, 24))).toBe(8);
    expect(daysToGo('month', new Date(2026, 9, 31))).toBe(1);
    expect(daysToGo('month', new Date(2026, 9, 1))).toBe(31);
  });

  it('counts today through Sunday for the week', () => {
    expect(daysToGo('week', new Date(2026, 9, 24))).toBe(2);
    expect(daysToGo('week', new Date(2026, 9, 25))).toBe(1);
    expect(daysToGo('week', new Date(2026, 9, 19))).toBe(7);
  });

  it('pluralises the label', () => {
    expect(daysToGoLabel(1)).toBe('1 day to go');
    expect(daysToGoLabel(8)).toBe('8 days to go');
  });
});

describe('labels', () => {
  it('greets by hour', () => {
    expect(greetingForHour(3)).toBe('Still up,');
    expect(greetingForHour(9)).toBe('Good morning,');
    expect(greetingForHour(14)).toBe('Good afternoon,');
    expect(greetingForHour(19)).toBe('Good evening,');
    expect(greetingForHour(22)).toBe('Good night,');
  });

  it('formats calendar days', () => {
    expect(dayMonthLabel(1, 9)).toBe('1 October');
    expect(shortDateLabel('2026-10-03')).toBe('3 Oct');
    expect(shortDateLabel('not a date')).toBe('');
  });
});

describe('relatedTransactions', () => {
  const rows = [
    tx({id: 'old', type: 'expense', amount: 10, transactionDate: '2026-09-30'}),
    tx({id: 'a', type: 'expense', amount: 20, transactionDate: '2026-10-05'}),
    tx({id: 'b', type: 'income', amount: 500, transactionDate: '2026-10-10'}),
    tx({id: 'c', type: 'expense', amount: 30, transactionDate: '2026-10-10', createdAt: '2026-10-10T09:00:00.000Z'}),
    tx({id: 'adj', type: 'expense', amount: 99, kind: 'balance_adjustment', transactionDate: '2026-10-11'}),
  ];

  it('keeps only this period, newest first, without ledger adjustments', () => {
    const list = relatedTransactions(rows, 'month', 'all', 10, now);
    expect(list.map(row => row.id)).toEqual(['c', 'b', 'a']);
  });

  it('can limit to expenses and to a count', () => {
    expect(relatedTransactions(rows, 'month', 'expenses', 10, now).map(row => row.id)).toEqual([
      'c',
      'a',
    ]);
    expect(relatedTransactions(rows, 'month', 'all', 1, now)).toHaveLength(1);
  });

  it('respects the week range', () => {
    expect(relatedTransactions(rows, 'week', 'all', 10, now)).toHaveLength(0);
  });
});

describe('home report balance change', () => {
  it('reports what the month added to the balance since its first day', () => {
    const rows = [
      tx({id: 'open', type: 'income', amount: 1000, kind: 'opening_balance', transactionDate: '2026-09-01'}),
      tx({id: '1', type: 'income', amount: 500, transactionDate: '2026-10-02'}),
      tx({id: '2', type: 'expense', amount: 200, transactionDate: '2026-10-05'}),
    ];
    const report = buildHomeReport(rows, categories, 'month', now);
    expect(report.startBalance).toBe(1000);
    expect(report.balance).toBe(1300);
    expect(report.balanceChange).toBe(300);
    expect(report.periodStart).toEqual({day: 1, monthIndex: 9});
  });
});

describe('recentTransactions', () => {
  it('returns the newest transactions first, capped at the limit', () => {
    const rows = [
      tx({id: 'a', type: 'expense', amount: 5, transactionDate: '2026-10-01'}),
      tx({id: 'b', type: 'income', amount: 50, transactionDate: '2026-10-20'}),
      tx({id: 'c', type: 'expense', amount: 9, transactionDate: '2026-10-10'}),
    ];
    expect(recentTransactions(rows, 2).map(row => row.id)).toEqual(['b', 'c']);
  });
});

describe('savingsSeries', () => {
  it('keeps a running income minus spending total up to today', () => {
    const now = new Date(2026, 9, 4, 12);
    const rows = [
      tx({id: 'i', type: 'income', amount: 100, transactionDate: '2026-10-02'}),
      tx({id: 'e', type: 'expense', amount: 30, transactionDate: '2026-10-03'}),
      tx({id: 'later', type: 'expense', amount: 99, transactionDate: '2026-10-20'}),
    ];
    expect(savingsSeries(rows, 'month', now)).toEqual([0, 100, 70, 70]);
  });
});
