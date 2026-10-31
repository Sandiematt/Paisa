import {
  automaticMonthlyBudget,
  dayToDayBudget,
  isAutomaticBudget,
  monthlyBudgetOf,
  withDayToDayBudget,
} from '../src/lib/budgetPlan';
import {buildHomeReport, lastMonthLine} from '../src/features/home/homeReport';
import {BudgetFields} from '../src/lib/budgetPlan';
import {TransactionRow} from '../src/lib/transactionsStore';

// 25,000 salary, 15,000 rent and 5,000 mess as monthly bills, 2,000 to save.
const plan: BudgetFields = {
  monthlyIncome: '25000',
  monthlyBudget: '',
  monthlySavingsGoal: '2000',
};
const bills = 15000 + 5000;

describe('budget plan', () => {
  it('calculates the budget as income less bills and savings', () => {
    expect(isAutomaticBudget(plan)).toBe(true);
    // Stored with bills included, so the dashboard takes them off as before.
    expect(monthlyBudgetOf(plan)).toBe(23000);
    expect(dayToDayBudget(monthlyBudgetOf(plan), bills)).toBe(3000);
  });

  it('recalculates an existing budget that was never set by hand', () => {
    const existing = {...plan, monthlyBudget: '18000'};
    expect(monthlyBudgetOf(existing)).toBe(23000);
    expect(monthlyBudgetOf({...existing, monthlySavingsGoal: '5000'})).toBe(20000);
  });

  it('works with no bills and no savings goal', () => {
    const bare = {monthlyIncome: '25000', monthlyBudget: '', monthlySavingsGoal: ''};
    expect(dayToDayBudget(monthlyBudgetOf(bare), 0)).toBe(25000);
  });

  it('keeps the stored budget when there is no income to calculate from', () => {
    const noIncome = {monthlyIncome: '', monthlyBudget: '9000', monthlySavingsGoal: ''};
    expect(isAutomaticBudget(noIncome)).toBe(false);
    expect(monthlyBudgetOf(noIncome)).toBe(9000);
  });

  it('never goes below zero when bills and savings take the whole income', () => {
    const tight = {...plan, monthlySavingsGoal: '12000'};
    expect(automaticMonthlyBudget(tight)).toBe(13000);
    expect(dayToDayBudget(monthlyBudgetOf(tight), bills)).toBe(0);
  });

  it('lets the user set their own day-to-day budget', () => {
    const custom = withDayToDayBudget(plan, '4000', bills);
    expect(custom.budgetCustom).toBe(true);
    expect(custom.monthlyBudget).toBe('24000');
    expect(dayToDayBudget(monthlyBudgetOf(custom), bills)).toBe(4000);
    // A custom budget no longer follows the savings goal.
    expect(monthlyBudgetOf({...custom, monthlySavingsGoal: '5000'})).toBe(24000);
  });

  it('goes back to calculated when the calculated amount is typed', () => {
    const custom = withDayToDayBudget(plan, '4000', bills);
    const back = withDayToDayBudget(custom, '3000', bills);
    expect(back.budgetCustom).toBe(false);
    expect(isAutomaticBudget(back)).toBe(true);
    expect(monthlyBudgetOf({...back, monthlySavingsGoal: '1000'})).toBe(24000);
  });

  it('clears a custom budget when the field is emptied', () => {
    const cleared = withDayToDayBudget(plan, '', bills);
    expect(cleared.budgetCustom).toBe(true);
    expect(monthlyBudgetOf(cleared)).toBe(0);
  });
});

function tx(
  id: string,
  type: TransactionRow['type'],
  amount: number,
  transactionDate: string,
): TransactionRow {
  return {
    id,
    userId: 'user-1',
    type,
    amount,
    categoryId: null,
    transactionDate,
    description: null,
    merchant: null,
    paymentMethod: 'Everyday',
    notes: null,
    kind: 'regular',
    isRecurring: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

describe('last month savings', () => {
  const now = new Date(2026, 10, 3);
  const report = (rows: TransactionRow[]) =>
    buildHomeReport(rows, [], 'month', now, {
      monthlyIncome: 25000,
      monthlyBudget: 23000,
      monthlySavingsGoal: 2000,
    });

  it('counts the income that came in, so extra income is saved', () => {
    const {lastMonthSavings} = report([
      tx('1', 'income', 25000, '2026-10-01'),
      tx('2', 'income', 1500, '2026-10-12'),
      tx('3', 'expense', 15000, '2026-10-02'),
      tx('4', 'expense', 9100, '2026-10-20'),
    ]);
    expect(lastMonthSavings).toEqual({label: 'October', saved: 2400, goal: 2000});
    expect(lastMonthLine(lastMonthSavings!, n => String(n))).toBe(
      'Saved 2400 against a 2000 goal',
    );
  });

  it('says how far short of the goal the month ended', () => {
    const {lastMonthSavings} = report([
      tx('1', 'income', 25000, '2026-10-01'),
      tx('2', 'expense', 23500, '2026-10-02'),
    ]);
    expect(lastMonthLine(lastMonthSavings!, n => String(n))).toBe(
      'Saved 1500, 500 short of the 2000 goal',
    );
  });

  it('is null before there is a tracked month with income', () => {
    expect(report([tx('1', 'income', 25000, '2026-11-01')]).lastMonthSavings).toBeNull();
    expect(report([tx('1', 'expense', 100, '2026-10-05')]).lastMonthSavings).toBeNull();
  });
});
