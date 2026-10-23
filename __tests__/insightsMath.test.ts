import {
  averagePace,
  averagePerDay,
  budgetPace,
  buildCategoryRows,
  buildShareText,
  buildSpendingBars,
  bucketLabel,
  compactNumber,
  compareFractions,
  describeDelta,
  elapsedDays,
  isOfflineError,
  localIsoDate,
  periodLabels,
  previousPeriodLabel,
  topWeekdayFromBuckets,
  updatedLabel,
} from '../src/features/insights/insightsMath';
import type {SpendBucket} from '../src/features/insights/insightsTypes';

const money = (value: number) => `₹${Math.round(value).toLocaleString('en-US')}`;

function bucket(label: string, amount: number, date = '2026-10-01'): SpendBucket {
  return {date, label, amount};
}

describe('periodLabels', () => {
  it('names the month, the previous month and the compared span', () => {
    const labels = periodLabels('month', '2026-10-24');
    expect(labels.summaryTitle).toBe('Spent in October');
    expect(labels.phrase).toBe('in October');
    expect(labels.currentLabel).toBe('October');
    expect(labels.previousLabel).toBe('September');
    expect(labels.previousQualifier).toBe('first 24 days');
    expect(labels.deltaTarget).toBe('September');
    expect(labels.barsTitle).toBe('Spending by week');
  });

  it('wraps January back to December of the previous year', () => {
    const labels = periodLabels('month', '2026-01-09');
    expect(labels.previousLabel).toBe('December');
    expect(labels.previousQualifier).toBe('first 9 days');
  });

  it('drops the qualifier when the whole previous month is compared', () => {
    // 31 March vs February (28 days): all of February is compared.
    expect(periodLabels('month', '2026-03-31').previousQualifier).toBeNull();
    expect(periodLabels('month', '2026-03-01').previousQualifier).toBe('first day');
  });

  it('uses rolling-7-day wording for the week', () => {
    const labels = periodLabels('week', '2026-10-24');
    expect(labels.summaryTitle).toBe('Spent in the last 7 days');
    expect(labels.previousLabel).toBe('Previous 7 days');
    expect(labels.deltaTarget).toBe('the previous 7 days');
    expect(labels.barsTitle).toBe('Spending by day');
    expect(labels.bucketNoun).toBe('day');
  });

  it('uses the calendar year and previous year for the year', () => {
    const labels = periodLabels('year', '2026-10-24');
    expect(labels.summaryTitle).toBe('Spent in 2026');
    expect(labels.previousLabel).toBe('2025');
    expect(labels.previousQualifier).toBe('to Oct 24');
    expect(labels.barsTitle).toBe('Spending by month');
    expect(periodLabels('year', '2026-12-31').previousQualifier).toBeNull();
  });

  it('previousPeriodLabel gives captions for "vs ..."', () => {
    expect(previousPeriodLabel('week', '2026-10-24')).toBe('previous 7 days');
    expect(previousPeriodLabel('month', '2026-10-24')).toBe('September');
    expect(previousPeriodLabel('year', '2026-10-24')).toBe('2025');
  });
});

describe('elapsedDays / averagePerDay', () => {
  it('counts the days each window covers', () => {
    expect(elapsedDays('week', '2026-10-24')).toBe(7);
    expect(elapsedDays('month', '2026-10-24')).toBe(24);
    expect(elapsedDays('year', '2026-03-01')).toBe(31 + 28 + 1);
    expect(elapsedDays('year', '2024-03-01')).toBe(31 + 29 + 1);
  });

  it('divides the total by the elapsed days', () => {
    expect(averagePerDay(2400, 'month', '2026-10-24')).toBe(100);
    expect(averagePerDay(700, 'week', '2026-10-24')).toBe(100);
    expect(averagePerDay(0, 'year', '2026-01-01')).toBe(0);
  });

  it('formats local dates with zero padding', () => {
    expect(localIsoDate(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('describeDelta', () => {
  it('reads a decrease as good, down and "less than"', () => {
    const delta = describeDelta({changeKind: 'decrease', deltaAmount: 4210, changePct: -8}, 'September', money);
    expect(delta).toEqual({tone: 'good', direction: 'down', text: '₹4,210 (8%) less than September'});
  });

  it('reads an increase as bad, up and "more than"', () => {
    const delta = describeDelta({changeKind: 'increase', deltaAmount: 500, changePct: 25}, 'the previous 7 days', money);
    expect(delta).toEqual({tone: 'bad', direction: 'up', text: '₹500 (25%) more than the previous 7 days'});
  });

  it('never shows a percentage for new or unchanged spending', () => {
    expect(describeDelta({changeKind: 'new', deltaAmount: 300, changePct: null}, 'September', money).text).toBe(
      'New spending, nothing recorded in September',
    );
    expect(describeDelta({changeKind: 'no-change', deltaAmount: 0, changePct: null}, '2025', money)).toEqual({
      tone: 'neutral',
      direction: 'flat',
      text: 'About the same as 2025',
    });
  });

  it('copes with a missing percentage and a negative delta amount', () => {
    const delta = describeDelta({changeKind: 'decrease', deltaAmount: -90, changePct: null}, 'September', money);
    expect(delta.text).toBe('₹90 less than September');
  });
});

describe('compareFractions', () => {
  it('scales both bars to the larger value', () => {
    expect(compareFractions(50, 100)).toEqual({current: 0.5, previous: 1});
    expect(compareFractions(100, 0)).toEqual({current: 1, previous: 0});
  });

  it('returns empty bars when both are zero', () => {
    expect(compareFractions(0, 0)).toEqual({current: 0, previous: 0});
  });
});

describe('budgetPace', () => {
  it('spreads the monthly budget over the bucket size', () => {
    // October has 31 days.
    expect(budgetPace('week', 3100, '2026-10-24')).toBeCloseTo(100);
    expect(budgetPace('month', 3100, '2026-10-24')).toBeCloseTo(700);
    expect(budgetPace('year', 3100, '2026-10-24')).toBe(3100);
  });

  it('has no pace without a usable budget', () => {
    expect(budgetPace('month', null, '2026-10-24')).toBeNull();
    expect(budgetPace('month', 0, '2026-10-24')).toBeNull();
  });
});

describe('averagePace', () => {
  it('averages the finished buckets and ignores the running one', () => {
    expect(averagePace([bucket('W1', 100), bucket('W2', 300), bucket('W3', 9999)], false)).toBe(200);
  });

  it('includes every bucket for a finished period and is null with nothing finished', () => {
    expect(averagePace([bucket('W1', 100), bucket('W2', 300)], true)).toBe(200);
    expect(averagePace([bucket('W1', 100)], false)).toBeNull();
  });
});

describe('bucketLabel', () => {
  it('expands month chunks and names the running bucket', () => {
    expect(bucketLabel('month', 'W2', false)).toBe('Week 2');
    expect(bucketLabel('month', 'W4', true)).toBe('This week');
    expect(bucketLabel('week', 'Mon', false)).toBe('Mon');
    expect(bucketLabel('week', 'Sat', true)).toBe('Today');
    expect(bucketLabel('year', 'Oct', true)).toBe('Oct');
  });
});

describe('buildSpendingBars', () => {
  const base = {referenceDate: '2026-10-24', isPeriodComplete: false};

  it('marks finished buckets over the budget pace and hatches the running one', () => {
    const {bars, pace, paceKind} = buildSpendingBars({
      ...base,
      period: 'month',
      monthlyBudget: 3100,
      buckets: [bucket('W1', 500), bucket('W2', 900), bucket('W3', 700), bucket('W4', 1200)],
    });
    expect(paceKind).toBe('budget');
    expect(pace).toBeCloseTo(700);
    expect(bars.map(bar => bar.state)).toEqual(['normal', 'over', 'normal', 'current']);
    expect(bars.map(bar => bar.label)).toEqual(['Week 1', 'Week 2', 'Week 3', 'This week']);
  });

  it('draws an average line, with no "over" bars, when there is no budget', () => {
    const {bars, pace, paceKind} = buildSpendingBars({
      ...base,
      period: 'week',
      monthlyBudget: null,
      buckets: [bucket('Mon', 100), bucket('Tue', 300), bucket('Wed', 50)],
    });
    expect(paceKind).toBe('average');
    expect(pace).toBe(200);
    expect(bars.map(bar => bar.state)).toEqual(['normal', 'normal', 'current']);
  });

  it('judges every bucket of a completed period', () => {
    const {bars} = buildSpendingBars({
      referenceDate: '2026-09-30',
      isPeriodComplete: true,
      period: 'year',
      monthlyBudget: 1000,
      buckets: [bucket('Jan', 1500), bucket('Feb', 800)],
    });
    expect(bars.map(bar => bar.state)).toEqual(['over', 'normal']);
  });

  it('has no pace line for a single running bucket without a budget', () => {
    const {pace, paceKind} = buildSpendingBars({
      ...base,
      period: 'year',
      monthlyBudget: null,
      buckets: [bucket('Jan', 10)],
    });
    expect(pace).toBeNull();
    expect(paceKind).toBeNull();
  });
});

describe('compactNumber', () => {
  it('shortens thousands and millions', () => {
    expect(compactNumber(940)).toBe('940');
    expect(compactNumber(12940)).toBe('12.9k');
    expect(compactNumber(12000)).toBe('12k');
    expect(compactNumber(129400)).toBe('129k');
    expect(compactNumber(1_250_000)).toBe('1.3M');
  });
});

describe('topWeekdayFromBuckets', () => {
  it('picks the biggest weekday for week buckets only', () => {
    const buckets = [bucket('Mon', 10), bucket('Sat', 90), bucket('Sun', 40)];
    expect(topWeekdayFromBuckets('week', buckets)).toBe('Sat');
    expect(topWeekdayFromBuckets('month', buckets)).toBeNull();
    expect(topWeekdayFromBuckets('week', [bucket('Mon', 0)])).toBeNull();
  });
});

describe('buildCategoryRows', () => {
  it('sorts by amount and scales bars to the biggest category', () => {
    const rows = buildCategoryRows([
      {id: 'b', label: 'Bills', slug: 'bills', amount: 250, previousAmount: 0},
      {id: 'd', label: 'Dining', slug: 'dining', amount: 500, previousAmount: 0},
      {id: 'z', label: 'Zero', slug: null, amount: 0, previousAmount: 10},
    ]);
    expect(rows.map(row => row.id)).toEqual(['d', 'b']);
    expect(rows[0].fraction).toBe(1);
    expect(rows[1].fraction).toBe(0.5);
    expect(rows[0].sharePct).toBe(67);
  });

  it('returns nothing for no spending', () => {
    expect(buildCategoryRows([])).toEqual([]);
  });
});

describe('buildShareText', () => {
  it('summarises the period, the change and the top categories', () => {
    const text = buildShareText(
      {
        period: 'month',
        referenceDate: '2026-10-24',
        currentTotal: 48652,
        changeKind: 'decrease',
        deltaAmount: 4210,
        changePct: -8,
        categories: [
          {id: 'a', label: 'Dining', slug: 'dining', amount: 15572, previousAmount: 0},
          {id: 'b', label: 'Groceries', slug: 'groceries', amount: 11684, previousAmount: 0},
        ],
      },
      money,
    );
    expect(text).toBe(
      [
        'Spent in October: ₹48,652',
        '₹4,210 (8%) less than September',
        'Top categories: Dining ₹15,572, Groceries ₹11,684',
        'Tracked with Paisa',
      ].join('\n'),
    );
  });
});

describe('updatedLabel', () => {
  const now = new Date('2026-10-24T12:00:00.000Z');
  it('describes recency', () => {
    expect(updatedLabel(null, now)).toBe('Example data');
    expect(updatedLabel('2026-10-24T11:59:40.000Z', now)).toBe('Updated just now');
    expect(updatedLabel('2026-10-24T11:30:00.000Z', now)).toBe('Updated 30 min ago');
    expect(updatedLabel('2026-10-24T09:00:00.000Z', now)).toBe('Updated 3 h ago');
    expect(updatedLabel('not a date', now)).toBe('Updated recently');
  });
});

describe('isOfflineError', () => {
  it('recognises connectivity failures', () => {
    expect(isOfflineError('Could not reach the server. Check your connection.')).toBe(true);
    expect(isOfflineError('Failed to send a request to the Edge Function')).toBe(true);
    expect(isOfflineError('Failed to load transaction data.')).toBe(false);
    expect(isOfflineError(null)).toBe(false);
  });
});
