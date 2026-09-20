// AI summary writer for Paisa Insights, powered by Google Gemini.
//
// CRITICAL: the AI is only ever shown the *already-calculated* statistics
// from calculations.ts, and it is only allowed to produce one field —
// `summary`. It never sees raw transactions and never produces numbers that
// aren't independently verified against the stats we handed it (see
// `isSummaryNumericallySafe` below). If the AI is unavailable, misbehaves,
// or the request fails for any reason, we fall back to a deterministic,
// template-based summary so the endpoint always returns something useful.

import type {CalculatedStats, PeriodKind} from './types.ts';

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const REQUEST_TIMEOUT_MS = 8000;
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

const SYSTEM_PROMPT = `You are the writing layer for Paisa, a personal finance app.
You will receive pre-calculated, already-verified financial statistics as JSON, covering a "week", "month", or "year" period (see "period" in the JSON).

Rules (do not break these):
- Generate a concise financial insight from the provided statistics only.
- The JSON includes a "framing" field — start your sentence with that exact phrase (e.g. "This week so far" or "Weekly Summary"), followed by a colon or dash, then the rest of your sentence.
- If "isPeriodComplete" is false, the period is still in progress: describe it as "This week/month/year so far" and do NOT present it as a finished, completed summary (no "you spent this week" — say "so far this week").
- If "isPeriodComplete" is true, the period has fully elapsed: write it as a "Weekly/Monthly/Yearly Summary" of what happened.
- Mention only meaningful spending patterns, changes, budget/savings progress, and notable categories that appear in the JSON. Do not invent data or make unsupported assumptions, and don't mention a field just because it exists if it isn't meaningful (e.g. skip "no-change"/null-percent items rather than forcing a sentence about them).
- Do NOT perform any math. Do NOT invent, estimate, round differently, or alter any number, percentage, date, or category name.
- Only use numbers and category names that appear verbatim in the JSON you are given.
- Write ONE short, warm, plain-English sentence (max 28 words) referencing the most significant, meaningful item in the data.
- A comparison's "changeKind" tells you how to phrase it: "increase"/"decrease" have a real percentage to quote; "new" means there was no spending in the comparison period at all (say it's new, don't say a percentage); "no-change" means spending was flat (say it's about the same, don't invent a percentage).
- Use the ₹ symbol for currency amounts.
- Do not add advice, warnings, or emojis unless the data clearly supports it.
- Respond with ONLY a JSON object of the exact shape: {"summary": "..."}. No other keys, no markdown, no code fences.`;

function summaryFraming(period: PeriodKind, isPeriodComplete: boolean): string {
  if (isPeriodComplete) {
    if (period === 'month') return 'Monthly Summary';
    if (period === 'year') return 'Yearly Summary';
    return 'Weekly Summary';
  }
  if (period === 'month') return 'This month so far';
  if (period === 'year') return 'This year so far';
  return 'This week so far';
}

/** Trimmed, numbers-only context handed to the AI — never raw transactions. */
function buildAiContext(stats: CalculatedStats) {
  return {
    period: stats.period,
    isPeriodComplete: stats.isPeriodComplete,
    framing: summaryFraming(stats.period, stats.isPeriodComplete),
    currency: stats.currency,
    periodComparison: {
      currentTotal: stats.periodComparison.currentTotal,
      previousTotal: stats.periodComparison.previousTotal,
      changePercent: stats.periodComparison.changePercent,
      direction: stats.periodComparison.direction,
      changeKind: stats.periodComparison.changeKind,
    },
    topCategoryChanges: stats.categoryChanges.slice(0, 3).map(change => ({
      category: change.category,
      changePercent: change.changePercent,
      direction: change.direction,
      changeKind: change.changeKind,
      amount: Math.abs(Math.round(change.changeAmount)),
    })),
    unusualSpending: stats.unusualSpending.map(unusual => ({
      category: unusual.category,
      percentAboveAverage: unusual.percentAboveAverage,
      isNewSpending: unusual.isNewSpending,
    })),
    savingsProgress: stats.savingsProgress.goalSet
      ? {
          percentOfGoal: stats.savingsProgress.percentOfGoal,
          onTrack: stats.savingsProgress.onTrack,
        }
      : null,
    significantChanges: stats.patternChanges.map(change => ({
      label: change.label,
      changePercent: change.changePercent,
      direction: change.direction,
    })),
  };
}

/** Recursively collects every finite numeric leaf value from an object/array. */
function collectNumbers(value: unknown, acc: Set<number>): void {
  if (typeof value === 'number' && Number.isFinite(value)) {
    acc.add(Math.round(Math.abs(value)));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectNumbers(item, acc));
    return;
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach(item => collectNumbers(item, acc));
  }
}

/**
 * Guards against AI hallucination: every number mentioned in the AI's
 * summary must correspond (within rounding tolerance) to a number we
 * actually calculated and handed to it. If anything doesn't match, the
 * summary is rejected and the caller falls back to the deterministic one.
 */
function isSummaryNumericallySafe(summary: string, context: unknown): boolean {
  const allowed = new Set<number>();
  collectNumbers(context, allowed);

  const found = summary.match(/\d+(\.\d+)?/g) ?? [];
  for (const raw of found) {
    const value = Math.round(parseFloat(raw));
    if (value === 0) continue;
    const isAllowed = [...allowed].some(candidate => Math.abs(candidate - value) <= 1);
    if (!isAllowed) return false;
  }
  return true;
}

function previousPeriodLabel(period: PeriodKind): string {
  if (period === 'month') return 'last month';
  if (period === 'year') return 'last year';
  return 'last week';
}

/** Rule-based summary used whenever the AI is unavailable or untrustworthy. */
export function buildFallbackSummary(stats: CalculatedStats): string {
  const {periodComparison, categoryChanges, period, isPeriodComplete} = stats;
  const label = previousPeriodLabel(period);
  const framing = summaryFraming(period, isPeriodComplete);

  if (periodComparison.changeKind === 'no-change') {
    return `${framing}: your spending is about the same as ${label}.`;
  }
  if (periodComparison.changeKind === 'new') {
    return `${framing}: you started spending — there was nothing recorded ${label}.`;
  }

  const trendWord = periodComparison.direction === 'down' ? 'less' : 'more';
  const pctText = periodComparison.changePercent === null ? '' : ` ${Math.abs(periodComparison.changePercent)}%`;

  let sentence = `${framing}: your spending${pctText} is ${trendWord} than ${label}`;
  const topChange = categoryChanges[0];
  if (topChange) {
    if (topChange.changeKind === 'new') {
      sentence += ` — new spending in ${topChange.category.toLowerCase()}`;
    } else if (topChange.changeKind !== 'no-change') {
      const verb = topChange.direction === 'down' ? 'dropped' : 'rose';
      sentence += ` — ${topChange.category.toLowerCase()} ${verb} the most`;
    }
  }
  return `${sentence}.`;
}

export async function generateSummary(stats: CalculatedStats): Promise<{summary: string; aiGenerated: boolean}> {
  const fallback = buildFallbackSummary(stats);
  const apiKey = Deno.env.get('GEMINI_API_KEY');
  if (!apiKey) {
    return {summary: fallback, aiGenerated: false};
  }

  const model = Deno.env.get('GEMINI_MODEL') || DEFAULT_MODEL;
  const context = buildAiContext(stats);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${GEMINI_API_BASE}/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        systemInstruction: {parts: [{text: SYSTEM_PROMPT}]},
        contents: [{role: 'user', parts: [{text: JSON.stringify(context)}]}],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 120,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      console.error('generate-insights: Gemini request failed', response.status, await response.text());
      return {summary: fallback, aiGenerated: false};
    }

    const payload = await response.json();
    const content = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof content !== 'string') {
      console.error('generate-insights: Gemini response missing content', JSON.stringify(payload).slice(0, 500));
      return {summary: fallback, aiGenerated: false};
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error('generate-insights: Gemini response was not valid JSON');
      return {summary: fallback, aiGenerated: false};
    }

    const candidate =
      typeof (parsed as {summary?: unknown})?.summary === 'string' ? (parsed as {summary: string}).summary.trim() : '';

    if (!candidate) {
      return {summary: fallback, aiGenerated: false};
    }

    if (!isSummaryNumericallySafe(candidate, context)) {
      console.warn('generate-insights: discarded AI summary with unverified numbers');
      return {summary: fallback, aiGenerated: false};
    }

    return {summary: candidate, aiGenerated: true};
  } catch (error) {
    console.error('generate-insights: AI summary generation failed', error);
    return {summary: fallback, aiGenerated: false};
  } finally {
    clearTimeout(timeout);
  }
}
