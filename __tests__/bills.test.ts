import {
  editableBills,
  endSeriesPatch,
  withScheduledBill,
  withoutScheduledBill,
} from '../src/lib/bills';
import {
  billCommitments,
  committedTotals,
  dueRecurringTransactions,
  monthlyBillTotal,
} from '../src/lib/recurring';
import {ScheduledEntry} from '../src/lib/scheduledSetup';
import {TransactionRow} from '../src/lib/transactionsStore';

jest.mock('../src/lib/supabase/client', () => ({supabase: {}}));

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
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

// Rent started in September and was copied on 1 October.
const rent = tx({id: 'rent', type: 'expense', amount: 15000, transactionDate: '2026-09-01', isRecurring: true, description: 'Rent'});
const rentOct = tx({
  id: 'rent-oct',
  type: 'expense',
  amount: 15000,
  transactionDate: '2026-10-01',
  isRecurring: true,
  externalRef: 'recurring:rent:2026-10',
});
const salary = tx({id: 'salary', type: 'income', amount: 25000, transactionDate: '2026-09-01', isRecurring: true});
const waiting: ScheduledEntry[] = [
  {ref: 'onboarding:salary', type: 'income', amount: 25000, slug: 'salary', description: 'Salary', date: '2026-11-01'},
  {ref: 'onboarding:bill:internet', type: 'expense', amount: 1000, slug: 'bills', description: 'Wi-Fi', date: '2026-11-05'},
];
const today = '2026-10-30';
const october = {start: '2026-10-01', end: '2026-10-31'};

describe('editableBills', () => {
  it('lists monthly bills from the ledger and the ones still waiting, by due day', () => {
    expect(editableBills([rent, rentOct, salary], waiting, today)).toEqual([
      {key: 'ledger:rent', source: 'ledger', label: 'Rent', amount: 15000, day: 1, nextDate: '2026-11-01'},
      {key: 'onboarding:bill:internet', source: 'scheduled', label: 'Wi-Fi', amount: 1000, day: 5, nextDate: '2026-11-05'},
    ]);
  });
});

describe('ending a series', () => {
  const ended = {...rent, ...endSeriesPatch(rent)};

  it('stops the copies and keeps past payments as bills', () => {
    expect(endSeriesPatch(rent)).toEqual({isRecurring: false, externalRef: 'recurring:rent:2026-09'});
    expect(dueRecurringTransactions([ended, rentOct], '2027-01-15')).toEqual([]);
    expect(editableBills([ended, rentOct], [], today)).toEqual([]);
  });

  it("still counts this month's payment, but not in the monthly bills total", () => {
    const bills = billCommitments([ended, rentOct], october);
    expect(committedTotals(bills).committed).toBe(15000);
    expect(monthlyBillTotal(bills)).toBe(0);
    // A month it was not paid in does not count it at all.
    expect(billCommitments([ended, rentOct], {start: '2026-11-01', end: '2026-11-30'})).toEqual([]);
  });
});

describe('scheduled bills', () => {
  it('changes a waiting bill, moving its date to the new due day', () => {
    const next = withScheduledBill(waiting, 'onboarding:bill:internet', {label: 'Fibre', amount: 1200, day: 10}, today);
    expect(next[1]).toEqual(
      expect.objectContaining({ref: 'onboarding:bill:internet', description: 'Fibre', amount: 1200, date: '2026-11-10', slug: 'bills'}),
    );
    expect(next[0]).toBe(waiting[0]);
  });

  it('adds a new bill on its next due date, and keeps the category of a bill it replaces', () => {
    const next = withScheduledBill(
      waiting,
      'onboarding:bill:rent-2',
      {label: 'Rent', amount: 16000, day: 1},
      today,
      {slug: 'housing', categoryId: 'cat-housing'},
    );
    expect(next[2]).toEqual({
      ref: 'onboarding:bill:rent-2',
      type: 'expense',
      amount: 16000,
      slug: 'housing',
      categoryId: 'cat-housing',
      description: 'Rent',
      date: '2026-11-01',
    });
  });

  it('keeps the paid-this-month answer only while the date stays the same', () => {
    const answered = waiting.map(entry =>
      entry.type === 'expense' ? {...entry, paidSince: '2026-10-29'} : entry,
    );
    const sameDay = withScheduledBill(answered, 'onboarding:bill:internet', {label: 'Wi-Fi', amount: 1100, day: 5}, today);
    expect(sameDay[1].paidSince).toBe('2026-10-29');
    const moved = withScheduledBill(answered, 'onboarding:bill:internet', {label: 'Wi-Fi', amount: 1100, day: 8}, today);
    expect(moved[1].paidSince).toBeUndefined();
  });

  it('removes a waiting bill', () => {
    expect(withoutScheduledBill(waiting, 'onboarding:bill:internet')).toEqual([waiting[0]]);
  });
});
