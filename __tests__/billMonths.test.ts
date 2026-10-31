import {
  BillMonth,
  billPaymentIds,
  billsDue,
  copySkipper,
  cycleBills,
  dueDateInCycle,
  plannedBillTotal,
} from '../src/lib/billMonths';
import {cycleRangeFor} from '../src/lib/budgetEngine';
import {budgetForCycle} from '../src/lib/budgetInputs';
import {dueRecurringTransactions} from '../src/lib/recurring';
import {TransactionRow} from '../src/lib/transactionsStore';

jest.mock('../src/lib/supabase/client', () => ({supabase: {}}));

function tx(
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'transactionDate'> & Partial<TransactionRow>,
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

const NOV = {start: '2026-11-01', end: '2026-11-30'};
// Rent on the 5th since September; this month's copy was added on 5 November.
const rent = tx({id: 'rent', type: 'expense', amount: 5000, transactionDate: '2026-09-05', isRecurring: true, description: 'Rent'});
const rentNov = tx({id: 'rent-nov', type: 'expense', amount: 5000, transactionDate: '2026-11-05', isRecurring: true, externalRef: 'recurring:rent:2026-11'});
// Electricity on the 20th: not come yet in the middle of the month.
const power = tx({id: 'power', type: 'expense', amount: 1200, transactionDate: '2026-10-20', isRecurring: true, description: 'Electricity'});

const status = (rows: TransactionRow[], months: BillMonth[] = [], pending = []) =>
  cycleBills(rows, NOV, pending, months).map(bill => [bill.label, bill.status, bill.paid ?? null]);

function bm(patch: Partial<BillMonth> & Pick<BillMonth, 'billKey' | 'status'>): BillMonth {
  return {
    cycleStart: '2026-11-01',
    label: '',
    plannedAmount: 0,
    paidAmount: null,
    transactionId: null,
    settledOn: null,
    ...patch,
  };
}

describe('cycleBills', () => {
  it('counts a copy added on the due day as paid, and a later one as to come', () => {
    expect(status([rent, rentNov, power])).toEqual([
      ['Rent', 'paid', 5000],
      ['Electricity', 'upcoming', null],
    ]);
  });

  it('takes what was actually paid when it differs from the plan', () => {
    const higher = {...rentNov, amount: 5400};
    const [bill] = cycleBills([rent, higher], NOV);
    expect(bill).toMatchObject({planned: 5000, paid: 5400, status: 'paid'});
  });

  it('keeps a bill the user says is not paid yet reserved, and holds its due-day copy', () => {
    const held = [bm({billKey: 'power', status: 'not_paid', label: 'Electricity', plannedAmount: 1200})];
    expect(status([rent, rentNov, power], held)).toEqual([
      ['Rent', 'paid', 5000],
      ['Electricity', 'notPaid', null],
    ]);
    const skip = copySkipper(held, date => cycleRangeFor(date).start);
    expect(dueRecurringTransactions([power], '2026-11-25', skip)).toEqual([]);
    // Without the hold it would have been added on the 20th.
    expect(dueRecurringTransactions([power], '2026-11-25')).toHaveLength(1);
  });

  it('counts an expense linked as a bill\'s payment as that bill, not day-to-day spending', () => {
    const upi = tx({id: 'upi-1', type: 'expense', amount: 1180, transactionDate: '2026-11-18', source: 'upi_auto'});
    const linked = [bm({billKey: 'power', status: 'paid', transactionId: 'upi-1', paidAmount: 1180})];
    expect(status([power, upi], linked)).toEqual([['Electricity', 'paid', 1180]]);
    const state = budgetForCycle(
      {total: 9000, savingsGoal: 2000, transactions: [power, upi], billMonths: linked},
      '2026-11-25',
    ).state;
    expect(state.spent).toBe(0);
    expect(state.fixed).toBe(1180);
    expect(billPaymentIds(linked)).toEqual(new Set(['upi-1']));
  });

  it('reads the answers given for bills still waiting for their first date', () => {
    const pending = [
      {key: 'onboarding:bill:wifi', label: 'Wi-Fi', amount: 700, date: '2026-12-03', paidSince: '2026-11-15'},
      {key: 'onboarding:bill:gym', label: 'Gym', amount: 1500, date: '2026-12-02', notPaidSince: '2026-11-15'},
      // An older "no, it starts next month" leaves this month out.
      {key: 'onboarding:bill:mess', label: 'Mess', amount: 3000, date: '2026-12-01'},
    ];
    const bills = cycleBills([], NOV, pending);
    expect(bills.map(bill => [bill.label, bill.status, bill.dueThisCycle])).toEqual([
      ['Mess', 'upcoming', false],
      ['Gym', 'notPaid', true],
      ['Wi-Fi', 'paidOutside', true],
    ]);
    expect(billsDue(bills).map(bill => bill.label)).toEqual(['Gym', 'Wi-Fi']);
  });

  it('carries an unpaid bill from an earlier month, then settles it when paid', () => {
    const october = bm({billKey: 'rent', cycleStart: '2026-10-01', status: 'not_paid', label: 'Rent', plannedAmount: 5000});
    const carried = cycleBills([rent, rentNov], NOV, [], [october]);
    expect(carried[0]).toMatchObject({label: 'Rent', status: 'notPaid', carried: true, cycleStart: '2026-10-01'});
    // Paid on 12 November: settled in November, and nothing carries into December.
    const pay = tx({id: 'pay', type: 'expense', amount: 5000, transactionDate: '2026-11-12'});
    const settled = {...october, status: 'paid' as const, transactionId: 'pay', paidAmount: 5000, settledOn: '2026-11-12'};
    expect(cycleBills([rent, rentNov, pay], NOV, [], [settled])[0]).toMatchObject({status: 'paid', carried: true, paid: 5000});
    expect(cycleBills([rent, pay], {start: '2026-12-01', end: '2026-12-31'}, [], [settled]).some(bill => bill.carried)).toBe(false);
  });

  it('plans a normal month from active bills only', () => {
    const october = bm({billKey: 'rent', cycleStart: '2026-10-01', status: 'not_paid', label: 'Rent', plannedAmount: 5000});
    expect(plannedBillTotal(cycleBills([rent, rentNov, power], NOV, [], [october]))).toBe(6200);
  });
});

describe('dueDateInCycle', () => {
  it('finds the day in a calendar month and across a payday cycle', () => {
    expect(dueDateInCycle(5, NOV)).toBe('2026-11-05');
    expect(dueDateInCycle(31, NOV)).toBe('2026-11-30');
    expect(dueDateInCycle(5, {start: '2026-10-25', end: '2026-11-24'})).toBe('2026-11-05');
    expect(dueDateInCycle(28, {start: '2026-10-25', end: '2026-11-24'})).toBe('2026-10-28');
  });
});
