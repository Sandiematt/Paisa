import {InsightDirection, InsightsResponse} from '../../lib/supabase/insights';
import {AiHighlight, CategoryMovement, InsightsData, WeeklyBar} from './insightsPlaceholder';

function buildWeeklyBars(buckets: {amount: number; label: string}[]): WeeklyBar[] {
  const max = Math.max(1, ...buckets.map(bucket => bucket.amount));
  return buckets.map(bucket => ({
    label: bucket.label,
    // Floor at 6% so a ₹0 bucket still renders a visible sliver instead of nothing.
    percent: Math.max(6, Math.round((bucket.amount / max) * 100)),
    tone: bucket.amount > 0 && bucket.amount === max ? 'accent' : 'sand',
  }));
}

function highlightTone(direction: InsightDirection): 'positive' | 'warning' {
  return direction === 'down' ? 'positive' : 'warning';
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

function periodNounFor(period: InsightsResponse['stats']['period']): string {
  if (period === 'month') return 'this month';
  if (period === 'year') return 'this year';
  return 'this week';
}

function comparisonLabelFor(period: InsightsResponse['stats']['period']): string {
  if (period === 'month') return 'than last month';
  if (period === 'year') return 'than last year';
  return 'than last week';
}

/** Converts the generate-insights Edge Function response into the screen's display shape. */
export function buildInsightsDataFromResponse(response: InsightsResponse): InsightsData {
  const {stats} = response;
  const {periodComparison} = stats;

  const highlights: AiHighlight[] = response.highlights.map((highlight, index) => ({
    id: `${index + 1}`,
    tone: highlightTone(highlight.direction),
    text: highlight.text,
  }));

  const movements: CategoryMovement[] = stats.categoryChanges.slice(0, 6).map(change => ({
    id: slugify(change.category),
    label: change.category,
    spent: change.currentAmount,
    deltaPct: change.changeKind === 'increase' || change.changeKind === 'decrease' ? change.changePercent : null,
    changeKind: change.changeKind,
  }));

  return {
    periodNoun: periodNounFor(stats.period),
    currentTotal: periodComparison.currentTotal,
    previousTotal: periodComparison.previousTotal,
    changePct:
      periodComparison.changeKind === 'increase' || periodComparison.changeKind === 'decrease'
        ? periodComparison.changePercent
        : null,
    changeKind: periodComparison.changeKind,
    deltaAmount: Math.abs(periodComparison.changeAmount),
    comparisonLabel: comparisonLabelFor(stats.period),
    weeklyBars: buildWeeklyBars(stats.trendBuckets),
    aiSummary: response.summary,
    aiHighlights:
      highlights.length > 0 ? highlights : [{id: '1', tone: 'positive', text: 'No notable changes this period.'}],
    movements,
  };
}
