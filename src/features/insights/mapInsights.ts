import type {InsightDirection, InsightsResponse} from '../../lib/supabase/insights';
import {bucketsSince, previousWindowEnd, topWeekdayFromBuckets, trackedDays} from './insightsMath';
import type {AiHighlight, CategoryMovement, CategorySpend, InsightsData} from './insightsTypes';

function highlightTone(direction: InsightDirection): 'positive' | 'warning' {
  return direction === 'down' ? 'positive' : 'warning';
}

function slugify(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '-');
}

type Stats = InsightsResponse['stats'];

/**
 * The full per-category breakdown when the backend sends it. A generate-insights
 * deployment from before the DX redesign only reports categories that moved by
 * 20 or more, so fall back to those: incomplete, but never wrong.
 */
function buildCategories(stats: Stats): CategorySpend[] {
  if (stats.categoryBreakdown) {
    return stats.categoryBreakdown
      .filter(item => item.currentAmount > 0)
      .map(item => ({
        id: item.slug ?? slugify(item.category),
        label: item.category,
        slug: item.slug,
        amount: item.currentAmount,
        previousAmount: item.previousAmount,
      }));
  }
  return stats.categoryChanges
    .filter(change => change.currentAmount > 0)
    .map(change => ({
      id: slugify(change.category),
      label: change.category,
      slug: null,
      amount: change.currentAmount,
      previousAmount: change.previousAmount,
    }))
    .sort((a, b) => b.amount - a.amount);
}

function buildTopWeekday(stats: Stats): string | null {
  if (stats.topSpendingWeekday !== undefined) return stats.topSpendingWeekday?.label ?? null;
  return topWeekdayFromBuckets(stats.period, stats.trendBuckets);
}

/**
 * Converts the generate-insights Edge Function response into the screen's
 * display shape. `fallbackBudget` is the profile budget, used only when the
 * backend did not report one. `trackingSince` (`YYYY-MM-DD`, the day the
 * account was created) hides the comparison, chart buckets and per-day
 * average days from before the user started tracking.
 */
export function buildInsightsDataFromResponse(
  response: InsightsResponse,
  fallbackBudget: number | null = null,
  trackingSince: string | null = null,
): InsightsData {
  const {stats} = response;
  const {periodComparison} = stats;
  const hasPrevious =
    !trackingSince ||
    trackingSince <= previousWindowEnd(stats.period, stats.referenceDate) ||
    periodComparison.previousTotal > 0;
  const startedInWindow = trackedDays(stats.period, stats.referenceDate, null) !==
    trackedDays(stats.period, stats.referenceDate, trackingSince);

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
    period: stats.period,
    referenceDate: stats.referenceDate,
    isPeriodComplete: stats.isPeriodComplete,
    currentTotal: periodComparison.currentTotal,
    previousTotal: periodComparison.previousTotal,
    hasPrevious,
    changePct:
      periodComparison.changeKind === 'increase' || periodComparison.changeKind === 'decrease'
        ? periodComparison.changePercent
        : null,
    changeKind: periodComparison.changeKind,
    deltaAmount: Math.abs(periodComparison.changeAmount),
    // The backend averages over the whole window; a user who joined part way
    // through is averaged over the days they were tracking.
    dailyAverage:
      stats.dailyAverage !== undefined && !startedInWindow
        ? stats.dailyAverage
        : Math.round((periodComparison.currentTotal / trackedDays(stats.period, stats.referenceDate, trackingSince)) * 100) /
          100,
    transactionCount: stats.transactionCount ?? null,
    topWeekday: buildTopWeekday(stats),
    buckets: bucketsSince(
      stats.trendBuckets.map(bucket => ({date: bucket.date, label: bucket.label, amount: bucket.amount})),
      trackingSince,
    ),
    monthlyBudget: stats.monthlyBudget ?? fallbackBudget,
    categories: buildCategories(stats),
    aiSummary: response.summary,
    aiHighlights:
      highlights.length > 0 ? highlights : [{id: '1', tone: 'positive', text: 'No notable changes this period.'}],
    movements: hasPrevious ? movements : [],
    generatedAt: response.generatedAt,
  };
}
