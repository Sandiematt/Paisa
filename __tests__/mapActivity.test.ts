import {ledgerForActivity, matchesQuery} from '../src/features/activity/mapActivity';
import {CategoryRow} from '../src/lib/categoriesStore';
import {
  TransactionRow,
  calendarDateISO,
  removeLedgerRow,
  upsertLedgerRow,
} from '../src/lib/transactionsStore';

const dining: CategoryRow = {
  id: 'cat-dining',
  userId: null,
  name: 'Dining',
  icon: 'utensils',
  color: '#E4573D',
  type: 'expense',
  slug: 'dining',
};

function tx(
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'transactionDate'> &
    Partial<TransactionRow>,
): TransactionRow {
  return {
    userId: 'user-1',
    categoryId: 'cat-dining',
    description: 'Lunch',
    merchant: 'Cafe Mocha',
    paymentMethod: 'Wallet',
    notes: 'Oat latte',
    isRecurring: false,
    createdAt: '2026-09-14T10:00:00.000Z',
    updatedAt: '2026-09-14T10:00:00.000Z',
    ...partial,
  };
}

describe('activity ledger helpers', () => {
  it('normalizes timestamp dates to a calendar day', () => {
    expect(calendarDateISO('2026-09-14T18:30:00.000Z')).toBe('2026-09-14');
    expect(calendarDateISO('2026-09-14')).toBe('2026-09-14');
  });

  it('upserts and removes rows so home and activity share one ledger', () => {
    const first = tx({id: '1', type: 'expense', amount: 12, transactionDate: '2026-09-14'});
    const second = tx({
      id: '2',
      type: 'income',
      amount: 40,
      transactionDate: '2026-09-13',
    });
    const edited = {...first, amount: 18};
    const merged = upsertLedgerRow(upsertLedgerRow([], first), second);
    expect(merged.map(row => row.id)).toEqual(['2', '1']);
    expect(upsertLedgerRow(merged, edited).find(row => row.id === '1')?.amount).toBe(18);
    expect(removeLedgerRow(merged, '1').map(row => row.id)).toEqual(['2']);
  });

  it('maps spend into activity items and hides opening-balance rows', () => {
    const rows = [
      tx({
        id: 'open',
        type: 'income',
        amount: 100,
        transactionDate: '2026-09-01',
        notes: 'opening_balance',
      }),
      tx({id: 'coffee', type: 'expense', amount: 6.5, transactionDate: '2026-09-14'}),
    ];
    const ledger = ledgerForActivity(rows, [dining]);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].merchant).toBe('Cafe Mocha');
    expect(ledger[0].amount).toBe(-6.5);
  });

  it('matches search tokens across merchant, note, category, and amount', () => {
    const [item] = ledgerForActivity(
      [tx({id: 'coffee', type: 'expense', amount: 6.5, transactionDate: '2026-09-14'})],
      [dining],
    );
    expect(matchesQuery(item, 'mocha')).toBe(true);
    expect(matchesQuery(item, 'oat latte')).toBe(true);
    expect(matchesQuery(item, 'dining 6.50')).toBe(true);
    expect(matchesQuery(item, 'uber')).toBe(false);
  });
});
