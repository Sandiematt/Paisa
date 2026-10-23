import {
  buildHomeReport,
  budgetForDay,
  budgetForSpan,
} from '../src/features/home/homeReport';
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
    Partial<Pick<TransactionRow, 'notes' | 'kind'>>,
): TransactionRow {
  return {
    userId: 'user-1',
    description: null,
    merchant: null,
    paymentMethod: 'Everyday',
    notes: null,
    kind: 'regular',
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
        kind: 'opening_balance',
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
        kind: 'opening_balance',
      }),
      tx({
        id: 'adj',
        type: 'income',
        amount: 200,
        categoryId: null,
        transactionDate: '2026-09-04',
        kind: 'balance_adjustment',
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

  it('counts a regular expense whose note reads opening_balance as spending', () => {
    const rows = [
      tx({
        id: 'open',
        type: 'income',
        amount: 5000,
        categoryId: null,
        transactionDate: '2026-08-01',
        kind: 'opening_balance',
      }),
      tx({
        id: 'sneaky',
        type: 'expense',
        amount: 400,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-03',
        notes: 'opening_balance',
      }),
      tx({
        id: 'sneaky-adj',
        type: 'expense',
        amount: 100,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-04',
        notes: 'balance_adjustment',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'month', now);
    expect(report.balance).toBe(4500);
    expect(report.income).toBe(0);
    expect(report.spent).toBe(500);
  });

  it('flags overspending separately from the savings plan', () => {
    const rows = [
      tx({
        id: 'open',
        type: 'income',
        amount: 10000,
        categoryId: null,
        transactionDate: '2026-08-01',
        kind: 'opening_balance',
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
    expect(report.savingsState).toEqual({ kind: 'positive', amount: 1000 });
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
    expect(report.savingsState).toEqual({ kind: 'no-income' });
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
    expect(report.savingsState).toEqual({ kind: 'positive', amount: 1500 });
    expect(report.plannedSavings).toBe(10000);
    expect(report.monthlySavingsGoal).toBe(5000);
    expect(report.overBudget).toBe(false);
    expect(report.planFeasible).toBe(true);
    expect(report.healthLabel).toBe('On track');
    expect(report.planLabel).toBe('On track');
    expect(report.insightKicker).toBe('Spending');
  });

  it('reports no income and ignores planned income for savings', () => {
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

    expect(report.savingsState).toEqual({ kind: 'no-income' });
    expect(report.planFeasible).toBe(true);
    expect(report.plannedSavings).toBe(10000);
    expect(report.overBudget).toBe(false);
  });

  it('reports negative savings with the overspend amount', () => {
    const rows = [
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
        amount: 1750.5,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-03',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'month', now);

    expect(report.savingsState).toEqual({ kind: 'negative', overspend: 750.5 });
  });

  it('treats exactly zero savings as positive when income was recorded', () => {
    const rows = [
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
        amount: 1000,
        categoryId: 'cat-housing',
        transactionDate: '2026-09-03',
      }),
    ];

    const report = buildHomeReport(rows, [housing], 'month', now);

    expect(report.savingsState).toEqual({ kind: 'positive', amount: 0 });
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

  it('computes a distinct change badge for week and month', () => {
    const rows = [
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

    expect(week.net).toBe(1800);
    expect(week.changePct).toBe(350);
    expect(week.compareLabel).toBe('vs last week');

    expect(month.net).toBe(2200);
    expect(month.changePct).toBe(-27);
    expect(month.compareLabel).toBe('vs August');
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

    expect(report.savingsState).toEqual({ kind: 'positive', amount: 28420 });
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
    expect(report.monthlySavingsState).toEqual({
      kind: 'positive',
      amount: 28420,
    });
  });

  describe('health score without a budget', () => {
    function earlier(extra: TransactionRow[]) {
      return [
        tx({id: 'in', type: 'income', amount: 1000, categoryId: null, transactionDate: '2026-09-02'}),
        tx({id: 'out', type: 'expense', amount: 500, categoryId: 'cat-housing', transactionDate: '2026-09-05'}),
        ...extra,
      ];
    }

    it('uses period spending over period income plus start-of-period balance', () => {
      const rows = earlier([
        tx({id: 'e1', type: 'income', amount: 400, categoryId: null, transactionDate: '2026-08-10'}),
        tx({id: 'e2', type: 'expense', amount: 100, categoryId: 'cat-housing', transactionDate: '2026-08-12'}),
      ]);
      const report = buildHomeReport(rows, [housing], 'month', now);
      expect(report.health).toBe(62);
      expect(report.spendRatio).toBe(38);
    });

    it('ignores money dated after the period', () => {
      const rows = earlier([
        tx({id: 'e1', type: 'income', amount: 300, categoryId: null, transactionDate: '2026-08-10'}),
        tx({id: 'f1', type: 'income', amount: 5000, categoryId: null, transactionDate: '2026-10-05'}),
      ]);
      expect(buildHomeReport(rows, [housing], 'month', now).health).toBe(62);
    });

    it('does not change when earlier transactions differ but start balance is the same', () => {
      const a = earlier([
        tx({id: 'o', type: 'income', amount: 300, categoryId: null, transactionDate: '2026-07-01', kind: 'opening_balance'}),
      ]);
      const b = earlier([
        tx({id: 'e1', type: 'income', amount: 900, categoryId: null, transactionDate: '2026-08-03'}),
        tx({id: 'e2', type: 'expense', amount: 600, categoryId: 'cat-housing', transactionDate: '2026-08-20'}),
        tx({id: 'adj', type: 'expense', amount: 0, categoryId: null, transactionDate: '2026-08-21', kind: 'balance_adjustment'}),
      ]);
      const ra = buildHomeReport(a, [housing], 'month', now);
      const rb = buildHomeReport(b, [housing], 'month', now);
      expect(ra.health).toBe(62);
      expect(rb.health).toBe(ra.health);
    });

    it('counts an opening balance dated inside the period as available money', () => {
      const rows = [
        tx({id: 'o', type: 'income', amount: 1000, categoryId: null, transactionDate: '2026-09-15', kind: 'opening_balance'}),
        tx({id: 'out', type: 'expense', amount: 250, categoryId: 'cat-housing', transactionDate: '2026-09-15'}),
      ];
      const report = buildHomeReport(rows, [housing], 'month', now);
      expect(report.health).toBe(75);
      expect(report.healthLabel).toBe('Good');
    });

    it('leaves the score at 0 with no NaN when income plus start balance is zero', () => {
      const rows = [
        tx({id: 'out', type: 'expense', amount: 50, categoryId: 'cat-housing', transactionDate: '2026-09-05'}),
      ];
      const report = buildHomeReport(rows, [housing], 'month', now);
      expect(report.health).toBe(0);
      expect(report.healthLabel).toBe('Poor');
      expect(report.spendRatio).toBe(100);
      expect(report.healthDelta).not.toBeNaN();
    });

    it('leaves the score at 0 when income plus start balance is negative', () => {
      const rows = [
        tx({id: 'e', type: 'expense', amount: 200, categoryId: 'cat-housing', transactionDate: '2026-08-05'}),
        tx({id: 'in', type: 'income', amount: 100, categoryId: null, transactionDate: '2026-09-02'}),
        tx({id: 'out', type: 'expense', amount: 50, categoryId: 'cat-housing', transactionDate: '2026-09-05'}),
      ];
      const report = buildHomeReport(rows, [housing], 'month', now);
      expect(report.health).toBe(0);
      expect(Number.isNaN(report.spendRatio)).toBe(false);
    });
  });

  describe('per-day prorated budget', () => {
    const plan = {
      monthlyIncome: 0,
      monthlyBudget: 3000,
      monthlySavingsGoal: 900,
    };

    it('prorates a week inside one month at that month rate', () => {
      const report = buildHomeReport([], [housing], 'week', new Date(2025, 8, 17), plan);
      expect(report.budget).toBe(700);
      expect(report.periodSavingsTarget).toBe(210);
    });

    it('splits a week spanning September and October per day', () => {
      const spent = tx({
        id: 's1',
        type: 'expense',
        amount: 500,
        categoryId: 'cat-housing',
        transactionDate: '2025-10-01',
      });
      const report = buildHomeReport([spent], [housing], 'week', new Date(2025, 9, 2), plan);
      // Mon 29 Sep - Tue 30 Sep at 3000/30, Wed 1 Oct - Sun 5 Oct at 3000/31
      expect(report.budget).toBe(683.87);
      expect(report.periodSavingsTarget).toBe(205.16);
      expect(report.remainingBudget).toBe(183.87);
      expect(report.overBudget).toBe(false);
      expect(report.spendRatio).toBe(73);
    });

    it('flags over budget against the prorated budget', () => {
      const spent = tx({
        id: 's2',
        type: 'expense',
        amount: 700,
        categoryId: 'cat-housing',
        transactionDate: '2025-10-01',
      });
      const report = buildHomeReport([spent], [housing], 'week', new Date(2025, 9, 2), plan);
      expect(report.overBudget).toBe(true);
      expect(report.remainingBudget).toBe(-16.13);
      expect(report.spendRatio).toBe(102);
    });

    it('gives the full monthly amount for a whole month', () => {
      const odd = {monthlyIncome: 0, monthlyBudget: 10000, monthlySavingsGoal: 3333};
      for (const month of [1, 8, 9]) {
        const report = buildHomeReport([], [housing], 'month', new Date(2025, month, 10), odd);
        expect(report.budget).toBe(10000);
        expect(report.periodSavingsTarget).toBe(3333);
      }
    });

    it('exposes the budget for a single day', () => {
      expect(budgetForDay(3000, new Date(2025, 8, 29))).toBe(100);
      expect(budgetForDay(3100, new Date(2025, 9, 1))).toBe(100);
      expect(budgetForDay(0, new Date(2025, 9, 1))).toBe(0);
    });

    it('sums a date span across months', () => {
      expect(budgetForSpan(3000, new Date(2025, 8, 29), new Date(2025, 9, 5))).toBe(683.87);
    });
  });

  describe('opening balance dated before the earliest transaction', () => {
    const august = new Date(2026, 7, 20);

    it('keeps the running balance non-negative in a period before signup holding a backdated expense', () => {
      const rows = [
        tx({id: 'o', type: 'income', amount: 1000, categoryId: null, transactionDate: '2026-08-10', kind: 'opening_balance'}),
        tx({id: 'out', type: 'expense', amount: 300, categoryId: 'cat-housing', transactionDate: '2026-08-10'}),
      ];
      const report = buildHomeReport(rows, [housing], 'month', august);
      expect(report.series.every(point => point >= 0)).toBe(true);
      expect(report.balance).toBe(700);
    });

    it('goes negative when the opening balance is dated after the backdated expense', () => {
      const rows = [
        tx({id: 'o', type: 'income', amount: 1000, categoryId: null, transactionDate: '2026-09-01', kind: 'opening_balance'}),
        tx({id: 'out', type: 'expense', amount: 300, categoryId: 'cat-housing', transactionDate: '2026-08-10'}),
      ];
      const report = buildHomeReport(rows, [housing], 'month', august);
      expect(report.series.some(point => point < 0)).toBe(true);
    });
  });
});
