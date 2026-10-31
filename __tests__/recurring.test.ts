import {
  dueRecurringTransactions,
  recurringRef,
  recurringRootId,
} from '../src/lib/recurring';
import {TransactionRow} from '../src/lib/transactionsStore';

function row(overrides: Partial<TransactionRow>): TransactionRow {
  return {
    id: 'root',
    userId: 'u1',
    type: 'expense',
    amount: 499,
    categoryId: 'c1',
    description: 'Bills',
    merchant: 'Bills',
    transactionDate: '2026-07-15',
    paymentMethod: null,
    notes: 'Streaming',
    kind: 'regular',
    isRecurring: true,
    source: 'manual',
    externalRef: null,
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

describe('dueRecurringTransactions', () => {
  it('adds one copy per month that has passed, on the same day', () => {
    const due = dueRecurringTransactions([row({})], '2026-10-27');
    expect(due.map(item => item.transactionDate)).toEqual([
      '2026-08-15',
      '2026-09-15',
      '2026-10-15',
    ]);
    expect(due[0]).toMatchObject({
      type: 'expense',
      amount: 499,
      categoryId: 'c1',
      notes: 'Streaming',
      isRecurring: true,
      externalRef: recurringRef('root', '2026-08'),
    });
  });

  it('adds nothing before the next occurrence is reached', () => {
    expect(dueRecurringTransactions([row({})], '2026-08-14')).toEqual([]);
    expect(dueRecurringTransactions([row({})], '2026-08-15')).toHaveLength(1);
  });

  it('skips months that are already saved', () => {
    const copy = row({
      id: 'copy',
      transactionDate: '2026-08-15',
      externalRef: recurringRef('root', '2026-08'),
    });
    const due = dueRecurringTransactions([row({}), copy], '2026-09-20');
    expect(due.map(item => item.transactionDate)).toEqual(['2026-09-15']);
  });

  it('uses the last day of a shorter month and crosses years', () => {
    const due = dueRecurringTransactions(
      [row({transactionDate: '2026-12-31'})],
      '2027-03-01',
    );
    expect(due.map(item => item.transactionDate)).toEqual([
      '2027-01-31',
      '2027-02-28',
    ]);
  });

  it('ignores rows that are not marked, copies and ledger rows', () => {
    const rows = [
      row({id: 'a', isRecurring: false}),
      row({id: 'b', externalRef: recurringRef('x', '2026-08')}),
      row({id: 'c', kind: 'opening_balance'}),
    ];
    expect(dueRecurringTransactions(rows, '2026-10-27')).toEqual([]);
  });

  it('caps how far back a series is caught up', () => {
    const due = dueRecurringTransactions(
      [row({transactionDate: '2015-01-10'})],
      '2026-10-27',
    );
    expect(due).toHaveLength(36);
  });
});

describe('recurringRootId', () => {
  it('reads the series from a copy and nothing from other rows', () => {
    expect(recurringRootId({externalRef: recurringRef('abc', '2026-08')})).toBe(
      'abc',
    );
    expect(recurringRootId({externalRef: 'upi:1:2:3'})).toBeNull();
    expect(recurringRootId({externalRef: null})).toBeNull();
  });
});
