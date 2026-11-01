/// <reference path="../supabase/functions/deno-env.d.ts" />
import {calculateInsightStats, earliestDateNeeded} from '../supabase/functions/generate-insights/calculations';
import {buildFallbackSummary} from '../supabase/functions/generate-insights/ai';
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

describe('highlights', () => {
  const housing = {name: 'Housing', slug: 'housing'};
  const salary = (date: string, amount: number) => expense(date, amount, null, {type: 'income'});

  it('says where the money went, not "new vs last week", when there is nothing to compare with', () => {
    const {highlights} = calculateInsightStats([expense('2026-10-30', 2000, housing)], profile, '2026-11-01', 'week');
    expect(highlights.map(h => h.text)).toEqual(['Everything this week went to Housing — ₹2,000']);
    expect(highlights[0].tone).toBe('neutral');
  });

  it('reports a savings goal that is far exceeded as reached, never as "4600%"', () => {
    const {highlights} = calculateInsightStats(
      [expense('2026-10-30', 2000, housing), salary('2026-11-01', 23000)],
      {...profile, monthlySavingsGoal: 500},
      '2026-11-01',
      'week',
    );
    const savings = highlights.find(h => h.category === 'Savings');
    expect(savings?.text).toBe('Monthly savings goal of ₹500 reached — ₹23,000 saved this month');
    expect(savings?.tone).toBe('good');
    expect(highlights.some(h => h.text.includes('%'))).toBe(false);
  });

  it('leaves the savings line out when the month has no savings yet', () => {
    const {highlights} = calculateInsightStats(
      [expense('2026-11-01', 300, housing)],
      {...profile, monthlySavingsGoal: 500},
      '2026-11-01',
      'week',
    );
    expect(highlights.some(h => h.category === 'Savings')).toBe(false);
  });

  it('marks spending going down as good and a new category against real history as bad', () => {
    const {highlights} = calculateInsightStats(
      [expense('2026-10-20', 900), expense('2026-10-28', 200), expense('2026-10-29', 400, housing)],
      profile,
      '2026-11-01',
      'week',
    );
    expect(highlights.find(h => h.category === 'Dining')).toMatchObject({text: 'Dining down ₹700 vs last week', tone: 'good'});
    expect(highlights.find(h => h.category === 'Housing')).toMatchObject({
      text: '₹400 on Housing — nothing there last week',
      tone: 'bad',
    });
  });

  it('writes the fallback summary as an amount when there is nothing to compare with', () => {
    const {stats} = calculateInsightStats([expense('2026-10-30', 2000, housing)], profile, '2026-11-01', 'week');
    expect(buildFallbackSummary(stats)).toBe('This week so far: ₹2,000 spent, all of it on housing.');
  });
});
