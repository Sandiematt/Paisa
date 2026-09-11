import {buildHomeReport} from '../src/features/home/homeReport';
import {CategoryRow} from '../src/lib/categoriesStore';
import {TransactionRow} from '../src/lib/transactionsStore';

const housing: CategoryRow = {
  id: 'cat-housing',
  userId: null,
  name: 'Housing',
  icon: 'home',
  color: '#E9A63C',
  type: 'expense',
  slug: 'housing',
};

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
  partial: Pick<TransactionRow, 'id' | 'type' | 'amount' | 'categoryId' | 'transactionDate'> &
    Partial<Pick<TransactionRow, 'notes'>>,
): TransactionRow {
  return {
    userId: 'user-1',
    description: null,
    merchant: null,
    paymentMethod: 'Everyday',
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...partial,
  };
}

describe('buildHomeReport', () => {
  const now = new Date(2026, 8, 15);

  it('computes income, spend, net, and previous-period change for the month', () => {
    const rows = [
      tx({
        id: '1',
        type: 'income',
        amount: 1000,
        categoryId: null,
        transactionDate: '2026-09-02',
      }),
      tx({
        id: '2',
        type: 'expense',
        amount: 250,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-03',
      }),
      tx({
        id: '3',
        type: 'expense',
        amount: 50,
        categoryId: 'cat-dining',
        transactionDate: '2026-09-10',
      }),
      tx({
        id: '4',
        type: 'income',
        amount: 400,
        categoryId: null,
        transactionDate: '2026-08-10',
      }),
      tx({
        id: '5',
        type: 'expense',
        amount: 100,
        categoryId: 'cat-housing',
        transactionDate: '2026-08-12',
      }),
    ];

    const report = buildHomeReport(rows, [housing, dining], 'month', now);

    expect(report.income).toBe(1000);
    expect(report.spent).toBe(300);
    expect(report.net).toBe(700);
    expect(report.balance).toBe(1000);
    expect(report.changePct).toBe(233);
    expect(report.slices[0].percent + report.slices[1].percent).toBe(100);
    expect(report.empty).toBe(false);
    expect(report.series).toHaveLength(15);
    expect(report.series[0]).toBe(300);
    expect(report.series[2]).toBe(1050);
    expect(report.highlightIndex).toBe(14);
    expect(report.healthLabel).toBe('Good');
    expect(report.savingsRate).toBe(77);
  });

  it('returns an empty month report without using stored totals', () => {
    const report = buildHomeReport([], [housing], 'month', now);
    expect(report.income).toBe(0);
    expect(report.spent).toBe(0);
    expect(report.net).toBe(0);
    expect(report.balance).toBe(0);
    expect(report.empty).toBe(true);
    expect(report.slices[0].id).toBe('empty');
    expect(report.healthLabel).toBe('No data');
  });

  it('treats opening balance as wallet seed, not period income', () => {
    const rows = [
      tx({
        id: 'open',
        type: 'income',
        amount: 5000,
        categoryId: null,
        transactionDate: '2026-08-01',
        notes: 'opening_balance',
      }),
      tx({
        id: 'pay',
        type: 'income',
        amount: 1000,
        categoryId: null,
        transactionDate: '2026-09-02',
      }),
      tx({
        id: 'rent',
        type: 'expense',
        amount: 300,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-03',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'month', now);

    expect(report.balance).toBe(5700);
    expect(report.income).toBe(1000);
    expect(report.spent).toBe(300);
    expect(report.net).toBe(700);
    expect(report.series[0]).toBe(5000);
    expect(report.series[2]).toBe(5700);
  });

  it('excludes balance adjustments from period income and spend', () => {
    const rows = [
      tx({
        id: 'open',
        type: 'income',
        amount: 5000,
        categoryId: null,
        transactionDate: '2026-08-01',
        notes: 'opening_balance',
      }),
      tx({
        id: 'adj',
        type: 'income',
        amount: 200,
        categoryId: null,
        transactionDate: '2026-09-04',
        notes: 'balance_adjustment',
      }),
      tx({
        id: 'pay',
        type: 'income',
        amount: 1000,
        categoryId: null,
        transactionDate: '2026-09-02',
      }),
      tx({
        id: 'rent',
        type: 'expense',
        amount: 300,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-03',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'month', now);
    expect(report.balance).toBe(5900);
    expect(report.income).toBe(1000);
    expect(report.spent).toBe(300);
  });

  it('flags overspending separately from the savings plan', () => {
    const rows = [
      tx({
        id: 'open',
        type: 'income',
        amount: 10000,
        categoryId: null,
        transactionDate: '2026-08-01',
        notes: 'opening_balance',
      }),
      tx({
        id: 'pay',
        type: 'income',
        amount: 10000,
        categoryId: null,
        transactionDate: '2026-09-02',
      }),
      tx({
        id: 'rent',
        type: 'expense',
        amount: 9000,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-03',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'month', now, {
      monthlyIncome: 10000,
      monthlyBudget: 6000,
      monthlySavingsGoal: 3000,
    });

    expect(report.spent).toBe(9000);
    expect(report.remainingBudget).toBe(-3000);
    expect(report.overBudget).toBe(true);
    expect(report.planFeasible).toBe(true);
    expect(report.planLabel).toBe('On track');
    expect(report.actualSavings).toBe(1000);
    expect(report.insightKicker).toBe('Spending');
    expect(report.healthLabel).toBe('Off track');
    expect(report.spendRatio).toBe(150);
  });

  it('reports an infeasible plan without mixing in actual spending', () => {
    const rows = [
      tx({
        id: 'coffee',
        type: 'expense',
        amount: 100,
        categoryId: 'cat-dining',
        transactionDate: '2026-09-02',
      }),
    ];

    const report = buildHomeReport(rows, [dining], 'month', now, {
      monthlyIncome: 10000,
      monthlyBudget: 9000,
      monthlySavingsGoal: 5000,
    });

    expect(report.overBudget).toBe(false);
    expect(report.planFeasible).toBe(false);
    expect(report.plannedSavings).toBe(1000);
    expect(report.actualSavings).toBe(-100);
    expect(report.healthLabel).toBe('On track');
    expect(report.planLabel).toBe('Off track');
    expect(report.planHint.toLowerCase()).toContain('month');
  });

  it('measures savings progress from actual income minus expenses', () => {
    const rows = [
      tx({
        id: 'pay',
        type: 'income',
        amount: 2000,
        categoryId: null,
        transactionDate: '2026-09-02',
      }),
      tx({
        id: 'coffee',
        type: 'expense',
        amount: 500,
        categoryId: 'cat-dining',
        transactionDate: '2026-09-03',
      }),
    ];

    const report = buildHomeReport(rows, [dining], 'month', now, {
      monthlyIncome: 30000,
      monthlyBudget: 20000,
      monthlySavingsGoal: 5000,
    });

    expect(report.actualSavings).toBe(1500);
    expect(report.plannedSavings).toBe(10000);
    expect(report.monthlySavingsGoal).toBe(5000);
    expect(report.overBudget).toBe(false);
    expect(report.planFeasible).toBe(true);
    expect(report.healthLabel).toBe('On track');
    expect(report.planLabel).toBe('On track');
    expect(report.insightKicker).toBe('Spending');
  });

  it('does not credit savings when planned income is unused and no income arrived', () => {
    const rows = [
      tx({
        id: 'coffee',
        type: 'expense',
        amount: 2000,
        categoryId: 'cat-dining',
        transactionDate: '2026-09-02',
      }),
    ];

    const report = buildHomeReport(rows, [dining], 'month', now, {
      monthlyIncome: 30000,
      monthlyBudget: 20000,
      monthlySavingsGoal: 5000,
    });

    expect(report.actualSavings).toBe(-2000);
    expect(report.planFeasible).toBe(true);
    expect(report.overBudget).toBe(false);
  });

  it('evaluates the savings plan monthly even on the week range', () => {
    const rows = [
      tx({
        id: 'pay',
        type: 'income',
        amount: 50000,
        categoryId: null,
        transactionDate: '2026-09-14',
      }),
      tx({
        id: 'rent',
        type: 'expense',
        amount: 21580,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-15',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'week', now, {
      monthlyIncome: 20000,
      monthlyBudget: 20000,
      monthlySavingsGoal: 1000,
    });

    expect(report.actualSavings).toBe(28420);
    expect(report.monthlySavingsGoal).toBe(1000);
    expect(report.periodSavingsTarget).toBe(233.33);
    expect(report.savingsVsTarget).toBe(28186.67);
    expect(report.planFeasible).toBe(false);
    expect(report.plannedSavings).toBe(0);
    expect(report.periodPlannedSavings).toBe(0);
    expect(report.planLabel).toBe('Off track');
    expect(report.overBudget).toBe(true);
    expect(report.healthLabel).toBe('Off track');
    expect(report.spendRatio).toBeGreaterThan(100);
  });
});
