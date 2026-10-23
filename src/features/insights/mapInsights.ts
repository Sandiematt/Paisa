import type {InsightDirection, InsightsResponse} from '../../lib/supabase/insights';
import {averagePerDay, topWeekdayFromBuckets} from './insightsMath';
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
 * backend did not report one.
 */
export function buildInsightsDataFromResponse(response: InsightsResponse, fallbackBudget: number | null = null): InsightsData {
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
    period: stats.period,
    referenceDate: stats.referenceDate,
    isPeriodComplete: stats.isPeriodComplete,
    currentTotal: periodComparison.currentTotal,
    previousTotal: periodComparison.previousTotal,
    changePct:
      periodComparison.changeKind === 'increase' || periodComparison.changeKind === 'decrease'
        ? periodComparison.changePercent
        : null,
    changeKind: periodComparison.changeKind,
    deltaAmount: Math.abs(periodComparison.changeAmount),
    dailyAverage:
      stats.dailyAverage ?? averagePerDay(periodComparison.currentTotal, stats.period, stats.referenceDate),
    transactionCount: stats.transactionCount ?? null,
    topWeekday: buildTopWeekday(stats),
    buckets: stats.trendBuckets.map(bucket => ({date: bucket.date, label: bucket.label, amount: bucket.amount})),
    monthlyBudget: stats.monthlyBudget ?? fallbackBudget,
    categories: buildCategories(stats),
    aiSummary: response.summary,
    aiHighlights:
      highlights.length > 0 ? highlights : [{id: '1', tone: 'positive', text: 'No notable changes this period.'}],
    movements,
    generatedAt: response.generatedAt,
  };
}
