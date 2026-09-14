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
    isRecurring: false,
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
    expect(report.changePct).toBe(133);
    expect(report.changeAmount).toBe(400);
    expect(report.compareLabel).toBe('vs August');
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

  it('does not invent a 100% change when there is no previous balance', () => {
    const rows = [
      tx({
        id: 'pay',
        type: 'income',
        amount: 11992,
        categoryId: null,
        transactionDate: '2026-09-02',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'month', now);

    expect(report.balance).toBe(11992);
    expect(report.changePct).toBe(0);
    expect(report.changeAmount).toBe(11992);
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
    expect(report.actualSavings).toBe(9900);
    expect(report.savingsUsesPlannedIncome).toBe(true);
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
    expect(report.savingsUsesPlannedIncome).toBe(false);
    expect(report.plannedSavings).toBe(10000);
    expect(report.monthlySavingsGoal).toBe(5000);
    expect(report.overBudget).toBe(false);
    expect(report.planFeasible).toBe(true);
    expect(report.healthLabel).toBe('On track');
    expect(report.planLabel).toBe('On track');
    expect(report.insightKicker).toBe('Spending');
  });

  it('uses planned income minus expenses when no income is logged', () => {
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

    expect(report.actualSavings).toBe(28000);
    expect(report.savingsUsesPlannedIncome).toBe(true);
    expect(report.planFeasible).toBe(true);
    expect(report.overBudget).toBe(false);
  });

  it('keeps week income and spend on this Monday–Sunday only', () => {
    const rows = [
      tx({
        id: 'last-week',
        type: 'expense',
        amount: 900,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-09',
      }),
      tx({
        id: 'this-week-pay',
        type: 'income',
        amount: 4000,
        categoryId: null,
        transactionDate: '2026-09-14T08:00:00.000Z',
      }),
      tx({
        id: 'this-week-rent',
        type: 'expense',
        amount: 1100,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-15',
      }),
    ];

    const week = buildHomeReport(rows, [housing], 'week', now);
    const month = buildHomeReport(rows, [housing], 'month', now);

    expect(week.income).toBe(4000);
    expect(week.spent).toBe(1100);
    expect(week.net).toBe(2900);
    expect(week.changePct).toBe(422);
    expect(week.changeAmount).toBe(3800);
    expect(week.compareLabel).toBe('vs last week');
    expect(month.spent).toBe(2000);
    expect(month.income).toBe(4000);
    expect(month.changePct).toBe(0);
    expect(month.compareLabel).toBe('vs August');
  });

  it('compares this year net to last year for the yearly badge', () => {
    const rows = [
      tx({
        id: 'last-year',
        type: 'income',
        amount: 2000,
        categoryId: null,
        transactionDate: '2025-03-10',
      }),
      tx({
        id: 'last-year-rent',
        type: 'expense',
        amount: 500,
        categoryId: 'cat-housing',
        transactionDate: '2025-06-01',
      }),
      tx({
        id: 'this-year',
        type: 'income',
        amount: 4500,
        categoryId: null,
        transactionDate: '2026-02-01',
      }),
      tx({
        id: 'this-year-rent',
        type: 'expense',
        amount: 1500,
        categoryId: 'cat-housing',
        transactionDate: '2026-04-01',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'year', now);

    expect(report.net).toBe(3000);
    expect(report.changePct).toBe(100);
    expect(report.changeAmount).toBe(1500);
    expect(report.compareLabel).toBe('vs last year');
  });

  it('computes a distinct change badge for week, month, and year', () => {
    const rows = [
      tx({
        id: 'last-year',
        type: 'income',
        amount: 10000,
        categoryId: null,
        transactionDate: '2025-04-01',
      }),
      tx({
        id: 'last-year-rent',
        type: 'expense',
        amount: 2000,
        categoryId: 'cat-housing',
        transactionDate: '2025-08-01',
      }),
      tx({
        id: 'august',
        type: 'income',
        amount: 4000,
        categoryId: null,
        transactionDate: '2026-08-10',
      }),
      tx({
        id: 'august-rent',
        type: 'expense',
        amount: 1000,
        categoryId: 'cat-housing',
        transactionDate: '2026-08-20',
      }),
      tx({
        id: 'last-week',
        type: 'income',
        amount: 500,
        categoryId: null,
        transactionDate: '2026-09-08',
      }),
      tx({
        id: 'last-week-food',
        type: 'expense',
        amount: 100,
        categoryId: 'cat-dining',
        transactionDate: '2026-09-09',
      }),
      tx({
        id: 'this-week',
        type: 'income',
        amount: 2000,
        categoryId: null,
        transactionDate: '2026-09-14',
      }),
      tx({
        id: 'this-week-food',
        type: 'expense',
        amount: 200,
        categoryId: 'cat-dining',
        transactionDate: '2026-09-15',
      }),
    ];

    const week = buildHomeReport(rows, [housing, dining], 'week', now);
    const month = buildHomeReport(rows, [housing, dining], 'month', now);
    const year = buildHomeReport(rows, [housing, dining], 'year', now);

    expect(week.net).toBe(1800);
    expect(week.changePct).toBe(350);
    expect(week.compareLabel).toBe('vs last week');

    expect(month.net).toBe(2200);
    expect(month.changePct).toBe(-27);
    expect(month.compareLabel).toBe('vs August');

    expect(year.net).toBe(5200);
    expect(year.changePct).toBe(-35);
    expect(year.compareLabel).toBe('vs last year');
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
    expect(report.budget).toBeLessThan(report.monthlyBudget);
    expect(report.monthlyBudget).toBe(20000);
    expect(report.monthlySpent).toBe(21580);
    expect(report.monthlyRemainingBudget).toBe(-1580);
    expect(report.monthlyOverBudget).toBe(true);
    expect(report.monthlySpendRatio).toBe(108);
    expect(report.monthlyActualSavings).toBe(28420);
    expect(report.monthlySavingsVsTarget).toBe(27420);
    expect(report.monthlySavingsUsesPlannedIncome).toBe(false);
  });
});
