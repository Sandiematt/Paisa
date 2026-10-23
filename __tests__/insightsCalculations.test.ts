import {calculateInsightStats, earliestDateNeeded} from '../supabase/functions/generate-insights/calculations';
import type {TransactionRecord} from '../supabase/functions/generate-insights/types';

let nextId = 0;

function expense(
  date: string,
  amount: number,
  category: {name: string; slug: string | null} | null = {name: 'Dining', slug: 'dining'},
  extra: Partial<TransactionRecord> = {},
): TransactionRecord {
  nextId += 1;
  return {
    id: `t${nextId}`,
    type: 'expense',
    amount,
    merchant: null,
    description: null,
    transactionDate: date,
    isRecurring: false,
    kind: 'regular',
    category,
    ...extra,
  };
}

const profile = {
  currency: 'INR',
  monthlyIncome: null,
  monthlyBudget: 6000,
  monthlySavingsGoal: null,
  startingBalance: null,
};

describe('year period', () => {
  const reference = '2026-10-24';

  const transactions = [
    // This year: Jan 1 .. Oct 24
    expense('2026-01-15', 100),
    expense('2026-03-02', 300, {name: 'Groceries', slug: 'groceries'}),
    expense('2026-10-24', 600),
    // Previous year, inside the same span (to Oct 24)
    expense('2025-02-10', 500),
    expense('2025-10-24', 250),
    // Previous year, after the compared span: must not count
    expense('2025-12-01', 9999),
    // Ledger entries and income never count as spending
    expense('2026-05-05', 7777, null, {kind: 'opening_balance'}),
    expense('2026-05-06', 5555, null, {type: 'income'}),
  ];

  const {stats} = calculateInsightStats(transactions, profile, reference, 'year');

  it('compares year to date against the same span of the previous year', () => {
    expect(stats.period).toBe('year');
    expect(stats.periodComparison.currentTotal).toBe(1000);
    expect(stats.periodComparison.previousTotal).toBe(750);
    expect(stats.periodComparison.changeKind).toBe('increase');
    expect(stats.periodComparison.changePercent).toBe(33);
  });

  it('buckets by month from January to the current month', () => {
    expect(stats.trendBuckets.map(bucket => bucket.label)).toEqual([
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct',
    ]);
    expect(stats.trendBuckets[0]).toEqual({date: '2026-01-01', amount: 100, label: 'Jan'});
    expect(stats.trendBuckets[2].amount).toBe(300);
    expect(stats.trendBuckets[9].amount).toBe(600);
  });

  it('reports the summary-card extras', () => {
    expect(stats.transactionCount).toBe(3);
    // 1000 over 297 days elapsed (Jan 1 .. Oct 24, 2026).
    expect(stats.dailyAverage).toBeCloseTo(1000 / 297, 2);
    expect(stats.monthlyBudget).toBe(6000);
    expect(stats.topSpendingWeekday).not.toBeNull();
  });

  it('breaks spending down by category, largest first, with the previous amount', () => {
    expect(stats.categoryBreakdown.map(item => [item.category, item.slug, item.currentAmount, item.previousAmount])).toEqual([
      ['Dining', 'dining', 700, 750],
      ['Groceries', 'groceries', 300, 0],
    ]);
  });

  it('only needs rows from January of the previous year', () => {
    expect(earliestDateNeeded('year', reference)).toBe('2025-01-01');
  });

  it('clamps Feb 29 to Feb 28 in a non-leap previous year', () => {
    const leap = calculateInsightStats(
      [expense('2025-02-28', 40), expense('2025-03-01', 1000), expense('2024-03-01', 1)],
      null,
      '2024-02-29',
      'year',
    );
    // Previous span is 2023-01-01 .. 2023-02-28, so nothing in 2024's data lands in it.
    expect(leap.stats.periodComparison.previousTotal).toBe(0);
  });
});

describe('month and week keep their behaviour', () => {
  it('keeps week buckets as 7 weekday labels and month buckets as W-chunks', () => {
    const week = calculateInsightStats([expense('2026-10-24', 10)], profile, '2026-10-24', 'week');
    expect(week.stats.trendBuckets).toHaveLength(7);
    expect(week.stats.trendBuckets[6].label).toBe('Sat');

    const month = calculateInsightStats([expense('2026-10-24', 10)], profile, '2026-10-24', 'month');
    expect(month.stats.trendBuckets.map(bucket => bucket.label)).toEqual(['W1', 'W2', 'W3', 'W4']);
    expect(month.stats.dailyAverage).toBeCloseTo(10 / 24, 2);
  });

  it('picks the weekday with the highest total as the biggest day', () => {
    // 2026-10-24 is a Saturday, 2026-10-19 a Monday.
    const {stats} = calculateInsightStats(
      [expense('2026-10-24', 500), expense('2026-10-17', 100), expense('2026-10-19', 400)],
      profile,
      '2026-10-24',
      'month',
    );
    expect(stats.topSpendingWeekday).toEqual({label: 'Sat', amount: 600});
  });

  it('reports no weekday, no categories and a null budget with nothing to show', () => {
    const {stats} = calculateInsightStats([], null, '2026-10-24', 'month');
    expect(stats.topSpendingWeekday).toBeNull();
    expect(stats.categoryBreakdown).toEqual([]);
    expect(stats.monthlyBudget).toBeNull();
    expect(stats.transactionCount).toBe(0);
    expect(stats.dailyAverage).toBe(0);
  });
});
