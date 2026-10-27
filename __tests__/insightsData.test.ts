import {categoryVisual} from '../src/features/insights/categoryVisual';
import {buildInsightsDataFromResponse} from '../src/features/insights/mapInsights';
import {buildSpendingBars} from '../src/features/insights/insightsMath';
import type {InsightsResponse} from '../src/lib/supabase/insights';

function response(overrides: Partial<InsightsResponse['stats']> = {}): InsightsResponse {
  return {
    summary: 'Dining is down.',
    highlights: [{category: 'Dining', text: 'Dining down ₹100 vs last month', direction: 'down', amount: 100}],
    generatedAt: '2026-10-24T10:00:00.000Z',
    aiGenerated: true,
    stats: {
      referenceDate: '2026-10-24',
      period: 'month',
      isPeriodComplete: false,
      currency: 'INR',
      periodComparison: {
        currentTotal: 1000,
        previousTotal: 1250,
        changeAmount: -250,
        changePercent: -20,
        direction: 'down',
        changeKind: 'decrease',
      },
      categoryChanges: [
        {
          category: 'Dining',
          currentAmount: 300,
          previousAmount: 500,
          changeAmount: -200,
          changePercent: -40,
          direction: 'down',
          changeKind: 'decrease',
        },
        {
          category: 'Travel',
          currentAmount: 600,
          previousAmount: 0,
          changeAmount: 600,
          changePercent: null,
          direction: 'up',
          changeKind: 'new',
        },
      ],
      unusualSpending: [],
      recurringPayments: {items: [], currentTotal: 0, previousTotal: 0, changePercent: null},
      savingsProgress: {
        goalSet: false,
        monthlySavingsGoal: null,
        savedSoFarThisMonth: 0,
        percentOfGoal: null,
        projectedMonthEndSavings: null,
        onTrack: null,
      },
      patternChanges: [],
      trendBuckets: [
        {date: '2026-10-01', amount: 400, label: 'W1'},
        {date: '2026-10-08', amount: 600, label: 'W2'},
      ],
      ...overrides,
    },
  };
}

describe('buildInsightsDataFromResponse', () => {
  it('maps the new backend fields when present', () => {
    const data = buildInsightsDataFromResponse(
      response({
        transactionCount: 12,
        dailyAverage: 41.67,
        topSpendingWeekday: {label: 'Sat', amount: 300},
        monthlyBudget: 3100,
        categoryBreakdown: [
          {category: 'Travel', slug: 'travel', currentAmount: 600, previousAmount: 0},
          {category: 'Dining', slug: 'dining', currentAmount: 300, previousAmount: 500},
        ],
      }),
    );
    expect(data.period).toBe('month');
    expect(data.referenceDate).toBe('2026-10-24');
    expect(data.transactionCount).toBe(12);
    expect(data.dailyAverage).toBe(41.67);
    expect(data.topWeekday).toBe('Sat');
    expect(data.monthlyBudget).toBe(3100);
    expect(data.categories.map(c => [c.label, c.slug, c.amount])).toEqual([
      ['Travel', 'travel', 600],
      ['Dining', 'dining', 300],
    ]);
    expect(data.changePct).toBe(-20);
    expect(data.deltaAmount).toBe(250);
    expect(data.generatedAt).toBe('2026-10-24T10:00:00.000Z');
  });

  it('degrades gracefully against a backend without the new fields', () => {
    const data = buildInsightsDataFromResponse(response(), 2000);
    expect(data.transactionCount).toBeNull();
    // 1000 over the 24 elapsed days of the month.
    expect(data.dailyAverage).toBeCloseTo(41.67, 2);
    expect(data.topWeekday).toBeNull();
    expect(data.monthlyBudget).toBe(2000);
    // Falls back to the categories that moved, largest spend first.
    expect(data.categories.map(c => c.label)).toEqual(['Travel', 'Dining']);
    expect(data.buckets).toHaveLength(2);
  });

  it('derives the biggest weekday from week buckets when the backend does not report it', () => {
    const data = buildInsightsDataFromResponse(
      response({
        period: 'week',
        trendBuckets: [
          {date: '2026-10-18', amount: 10, label: 'Sun'},
          {date: '2026-10-19', amount: 90, label: 'Mon'},
        ],
      }),
    );
    expect(data.topWeekday).toBe('Mon');
  });

  it('prefers the backend budget over the fallback and treats null weekday as unknown', () => {
    const data = buildInsightsDataFromResponse(response({monthlyBudget: null, topSpendingWeekday: null}), 1500);
    expect(data.monthlyBudget).toBe(1500);
    expect(data.topWeekday).toBeNull();
  });

  it('only shows a percentage for increase and decrease', () => {
    const data = buildInsightsDataFromResponse(
      response({
        periodComparison: {
          currentTotal: 500,
          previousTotal: 0,
          changeAmount: 500,
          changePercent: null,
          direction: 'up',
          changeKind: 'new',
        },
      }),
    );
    expect(data.changePct).toBeNull();
    expect(data.changeKind).toBe('new');
    expect(data.movements.find(m => m.label === 'Travel')?.deltaPct).toBeNull();
  });

  it('maps a year response', () => {
    const data = buildInsightsDataFromResponse(
      response({
        period: 'year',
        trendBuckets: [
          {date: '2026-01-01', amount: 100, label: 'Jan'},
          {date: '2026-02-01', amount: 200, label: 'Feb'},
        ],
      }),
    );
    expect(data.period).toBe('year');
    expect(buildSpendingBars(data).bars.map(bar => bar.label)).toEqual(['Jan', 'Feb']);
  });
});

describe('categoryVisual', () => {
  it('maps known slugs to a distinct icon and tone', () => {
    expect(categoryVisual('dining', 'Dining')).toEqual({icon: 'dining', tone: 'rose'});
    expect(categoryVisual('groceries', 'Groceries')).toEqual({icon: 'cart', tone: 'primary'});
    expect(categoryVisual('transport', 'Transport')).toEqual({icon: 'car', tone: 'savings'});
    expect(categoryVisual('bills', 'Bills')).toEqual({icon: 'bolt', tone: 'gold'});
  });

  it('falls back to the name, then keywords, then a generic tag', () => {
    expect(categoryVisual(null, 'Dining').icon).toBe('dining');
    expect(categoryVisual(null, 'Petrol').icon).toBe('car');
    expect(categoryVisual(null, 'Eating out').icon).toBe('dining');
    expect(categoryVisual(null, 'Pets').icon).toBe('tag');
    // "business" must not match the "bus" keyword.
    expect(categoryVisual(null, 'Business').icon).toBe('tag');
  });
});
