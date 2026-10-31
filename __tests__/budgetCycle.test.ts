import {cycleFor, previousCycle} from '../src/lib/budgetCycle';
import {billCommitments, committedTotals} from '../src/lib/recurring';
import {buildHomeReport, dayToDaySpentFor, scaleMonthly} from '../src/features/home/homeReport';
import {TransactionRow, localDateISO} from '../src/lib/transactionsStore';

jest.mock('../src/lib/supabase/client', () => ({supabase: {}}));

function iso(date: Date): string {
  return localDateISO(date);
}

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

describe('cycleFor', () => {
  it('is the calendar month without a payday', () => {
    const cycle = cycleFor(new Date(2026, 9, 29), null);
    expect([iso(cycle.start), iso(cycle.end), cycle.length]).toEqual(['2026-10-01', '2026-10-31', 31]);
  });

  it('runs payday to the day before the next payday', () => {
    const before = cycleFor(new Date(2026, 9, 24), 25);
    expect([iso(before.start), iso(before.end)]).toEqual(['2026-09-25', '2026-10-24']);
    const on = cycleFor(new Date(2026, 9, 25), 25);
    expect([iso(on.start), iso(on.end), on.length]).toEqual(['2026-10-25', '2026-11-24', 31]);
  });

  it('moves a payday past a short month to its last day', () => {
    const cycle = cycleFor(new Date(2026, 1, 10), 31);
    expect([iso(cycle.start), iso(cycle.end), cycle.length]).toEqual(['2026-01-31', '2026-02-27', 28]);
    const march = cycleFor(new Date(2026, 1, 28), 30);
    expect([iso(march.start), iso(march.end)]).toEqual(['2026-02-28', '2026-03-29']);
  });

  it('crosses the year', () => {
    const cycle = cycleFor(new Date(2027, 0, 3), 7);
    expect([iso(cycle.start), iso(cycle.end)]).toEqual(['2026-12-07', '2027-01-06']);
    const previous = previousCycle(new Date(2027, 0, 3), 7);
    expect([iso(previous.start), iso(previous.end)]).toEqual(['2026-11-07', '2026-12-06']);
  });
});

describe('billCommitments', () => {
  const cycle = {start: '2026-10-25', end: '2026-11-24'};
  const rows = [
    tx({id: 'rent', type: 'expense', amount: 18000, transactionDate: '2026-09-01', isRecurring: true, description: 'Rent'}),
    tx({
      id: 'rent-oct',
      type: 'expense',
      amount: 19000,
      transactionDate: '2026-10-01',
      isRecurring: true,
      externalRef: 'recurring:rent:2026-10',
    }),
    tx({
      id: 'rent-nov',
      type: 'expense',
      amount: 19000,
      transactionDate: '2026-11-01',
      isRecurring: true,
      externalRef: 'recurring:rent:2026-11',
    }),
    tx({id: 'wifi', type: 'expense', amount: 999, transactionDate: '2026-10-10', isRecurring: true, description: 'Wi-Fi'}),
    tx({id: 'salary', type: 'income', amount: 60000, transactionDate: '2026-10-01', isRecurring: true}),
    tx({id: 'food', type: 'expense', amount: 300, transactionDate: '2026-10-26'}),
  ];

  it('lists each expense series once, at its latest amount, with this cycle paid or due', () => {
    const bills = billCommitments(rows, cycle, [
      {key: 'onboarding:bill:gym', label: 'Gym', amount: 1500, date: '2026-11-05'},
      {key: 'onboarding:bill:ott', label: 'Streaming', amount: 199, date: '2026-12-01'},
    ]);
    expect(bills.map(b => [b.label, b.amount, b.day, b.dueThisCycle, b.paidThisCycle])).toEqual([
      ['Rent', 19000, 1, true, true],
      ['Streaming', 199, 1, false, false],
      ['Gym', 1500, 5, true, false],
      ['Wi-Fi', 999, 10, true, false],
    ]);
    expect(committedTotals(bills)).toEqual({committed: 21499, upcoming: 2499});
  });
});

describe('buildHomeReport with a payday and bills', () => {
  const now = new Date(2026, 9, 29);
  const rows = [
    tx({id: 'open', type: 'income', amount: 10000, transactionDate: '2026-10-20', kind: 'opening_balance'}),
    tx({id: 'before', type: 'expense', amount: 700, transactionDate: '2026-10-24'}),
    tx({id: 'food', type: 'expense', amount: 300, transactionDate: '2026-10-26'}),
    // Last cycle's Wi-Fi: this cycle's copy is not saved yet.
    tx({id: 'wifi', type: 'expense', amount: 999, transactionDate: '2026-10-10', isRecurring: true}),
  ];

  it('runs the month from payday and holds back bills still to come', () => {
    const report = buildHomeReport(rows, [], 'month', now, {
      monthlyIncome: 0,
      monthlyBudget: 31000,
      monthlySavingsGoal: 0,
      payday: 25,
    });
    expect(report.rangeLabel).toBe('25 OCT – 24 NOV');
    expect(report.compareLabel).toBe('vs last pay cycle');
    expect(report.spent).toBe(300);
    expect(report.monthlyCommitted).toBe(999);
    expect(report.monthlyUpcomingBills).toBe(999);
    expect(report.remainingBudget).toBe(31000 - 300 - 999);
  });

  it('reserves bills not paid yet this cycle', () => {
    const report = buildHomeReport(
      rows.filter(row => row.id !== 'wifi'),
      [],
      'month',
      now,
      {
        monthlyIncome: 0,
        monthlyBudget: 31000,
        monthlySavingsGoal: 0,
        payday: 25,
        pendingBills: [{key: 'onboarding:bill:rent', label: 'Rent', amount: 18000, date: '2026-11-01'}],
      },
    );
    expect(report.monthlyUpcomingBills).toBe(18000);
    expect(report.remainingBudget).toBe(31000 - 300 - 18000);
    expect(report.overBudget).toBe(false);
  });

  // Signed up on the 29th with payday on the 1st: the bills start next cycle,
  // but the monthly budget is still shown and edited after them.
  it('counts bills that start next cycle in the monthly bill total', () => {
    const report = buildHomeReport([], [], 'month', now, {
      monthlyIncome: 25000,
      monthlyBudget: 24500,
      monthlySavingsGoal: 500,
      payday: 1,
      pendingBills: [
        {key: 'onboarding:bill:rent', label: 'Rent', amount: 15000, date: '2026-11-01'},
        {key: 'onboarding:bill:internet', label: 'Wi-Fi', amount: 1000, date: '2026-11-01'},
        {key: 'onboarding:bill:food', label: 'Food', amount: 5000, date: '2026-11-01'},
      ],
    });
    expect(report.monthlyCommitted).toBe(0);
    expect(report.monthlyBills).toBe(21000);
  });

  it('takes bills paid before sign-up off this month', () => {
    const report = buildHomeReport([], [], 'month', now, {
      monthlyIncome: 25000,
      monthlyBudget: 24500,
      monthlySavingsGoal: 500,
      payday: 1,
      pendingBills: [
        {key: 'onboarding:bill:rent', label: 'Rent', amount: 15000, date: '2026-11-01', paidSince: '2026-10-29'},
        {key: 'onboarding:bill:food', label: 'Food', amount: 6000, date: '2026-11-01', paidSince: '2026-10-29'},
      ],
    });
    expect(report.monthlyCommitted).toBe(21000);
    // No row holds them, so the budget still holds them back.
    expect(report.monthlyUpcomingBills).toBe(21000);
    expect(report.remainingBudget).toBe(3500);
    expect(report.bills.every(bill => bill.paidThisCycle)).toBe(true);
  });

  it('keeps calendar months without a payday', () => {
    const report = buildHomeReport(rows, [], 'month', now, {
      monthlyIncome: 0,
      monthlyBudget: 31000,
      monthlySavingsGoal: 0,
    });
    expect(report.rangeLabel).toBe('OCTOBER');
    expect(report.spent).toBe(700 + 300 + 999);
  });
});

describe('the budget is shown after bills', () => {
  // 22,000 budget; Rent 15,000 and Wi-Fi 1,000 paid this month as monthly rows.
  const now = new Date(2026, 9, 30);
  const plan = {monthlyIncome: 25000, monthlyBudget: 22000, monthlySavingsGoal: 500};
  const bills = [
    tx({id: 'rent', type: 'expense', amount: 15000, transactionDate: '2026-10-01', isRecurring: true}),
    tx({id: 'wifi', type: 'expense', amount: 1000, transactionDate: '2026-10-02', isRecurring: true}),
  ];

  it('is what the bills leave, judged on day-to-day spending', () => {
    const quiet = buildHomeReport(bills, [], 'month', now, plan);
    expect(quiet.budget).toBe(6000);
    expect(quiet.budgetSpent).toBe(0);
    expect(quiet.remainingBudget).toBe(6000);
    expect(quiet.spendRatio).toBe(0);
    // Total spending, bills included, is still reported for the wallet.
    expect(quiet.spent).toBe(16000);
    // Planned savings still come from the whole budget.
    expect(quiet.plannedSavings).toBe(3000);

    const report = buildHomeReport(
      [...bills, tx({id: 'food', type: 'expense', amount: 1500, transactionDate: '2026-10-20'})],
      [],
      'month',
      now,
      plan,
    );
    expect(report.budgetSpent).toBe(1500);
    expect(report.remainingBudget).toBe(4500);
    expect(report.spendRatio).toBe(25);
    // Budget alerts weigh the same day-to-day spending.
    expect(
      dayToDaySpentFor(
        [...bills, tx({id: 'food', type: 'expense', amount: 1500, transactionDate: '2026-10-20'})],
        now,
        null,
      ),
    ).toBe(1500);
  });

  it("splits what the bills leave for a week's budget", () => {
    const week = buildHomeReport(bills, [], 'week', now, plan);
    expect(week.budget).toBe(scaleMonthly(6000, 'week', now, null));
    expect(week.budget).toBeLessThan(scaleMonthly(22000, 'week', now, null));
  });

  it('is over budget when the bills alone are more than it', () => {
    const report = buildHomeReport(bills, [], 'month', now, {...plan, monthlyBudget: 15000});
    expect(report.budget).toBe(0);
    expect(report.remainingBudget).toBe(-1000);
    expect(report.overBudget).toBe(true);
  });
});
