// Deterministic anomaly + forecast math for Paisa AI chat.
//
// CRITICAL: like context-builder.ts, this module never talks to Gemini.
// It only turns the already-computed `ChatFinancialContext` into two
// optional, fully-verified facts the reply AI may reference: an unusual
// spending flag and a month-end budget forecast.

import type {CategorySpend, ChatAnomaly, ChatForecast} from './types.ts';

const UNUSUAL_RATIO_THRESHOLD = 1.4; // 40% above the trailing average
const UNUSUAL_MIN_DELTA = 150; // ₹ — minimum absolute jump to bother flagging
const NEW_SPENDING_MIN_AMOUNT = 300; // ₹ — minimum to flag a category with no baseline at all

function roundInt(value: number): number {
  return Math.round(value);
}

/**
 * Picks the single most unusual category this month, if any — the one
 * furthest (in absolute ₹) above its trailing 3-month average, gated by a
 * minimum ratio and a minimum absolute delta so small/noisy jumps don't
 * trigger a warning.
 */
export function detectAnomaly(categorySpend: CategorySpend[]): ChatAnomaly | null {
  let best: ChatAnomaly | null = null;
  let bestDelta = 0;

  for (const entry of categorySpend) {
    if (entry.amountThisMonth <= 0) continue;

    if (entry.baselineAverage <= 0) {
      if (entry.amountThisMonth < NEW_SPENDING_MIN_AMOUNT) continue;
      const delta = entry.amountThisMonth;
      if (delta > bestDelta) {
        bestDelta = delta;
        best = {
          category: entry.name,
          currentAmount: roundInt(entry.amountThisMonth),
          averageAmount: 0,
          percentAboveAverage: 100,
          message: `${entry.name} is new spending this month — ₹${roundInt(entry.amountThisMonth)} so far.`,
        };
      }
      continue;
    }

    const ratio = entry.amountThisMonth / entry.baselineAverage;
    const delta = entry.amountThisMonth - entry.baselineAverage;
    if (ratio >= UNUSUAL_RATIO_THRESHOLD && delta >= UNUSUAL_MIN_DELTA && delta > bestDelta) {
      bestDelta = delta;
      const pct = roundInt((ratio - 1) * 100);
      best = {
        category: entry.name,
        currentAmount: roundInt(entry.amountThisMonth),
        averageAmount: roundInt(entry.baselineAverage),
        percentAboveAverage: pct,
        message: `${entry.name} is ${pct}% above your usual pace this month (₹${roundInt(entry.amountThisMonth)} vs. a ₹${roundInt(
          entry.baselineAverage,
        )} average).`,
      };
    }
  }

  return best;
}

/**
 * Projects month-end spending from the current daily pace and flags
 * whether that projection would exceed the monthly budget. Returns `null`
 * when there's no budget set or no elapsed days to project from.
 */
export function detectForecast(
  spentThisMonth: number,
  monthlyBudget: number,
  daysElapsed: number,
  daysInMonth: number,
): ChatForecast | null {
  if (monthlyBudget <= 0 || daysElapsed <= 0) {
    return null;
  }

  const dailyAverage = spentThisMonth / daysElapsed;
  const projectedMonthEnd = roundInt(dailyAverage * daysInMonth);
  const willOverbudget = projectedMonthEnd > monthlyBudget;

  let daysToLimit: number | null = null;
  if (willOverbudget && dailyAverage > 0.005) {
    const remaining = monthlyBudget - spentThisMonth;
    daysToLimit = remaining > 0 ? Math.max(0, Math.floor(remaining / dailyAverage)) : 0;
  }

  const message = willOverbudget
    ? `At this pace you're projected to spend about ₹${projectedMonthEnd} this month, over your ₹${roundInt(monthlyBudget)} budget.`
    : null;

  return {projectedMonthEnd, willOverbudget, daysToLimit, message};
}
