// Rule-based reply used whenever Gemini is unavailable or its reply fails
// the numeric-safety check in index.ts. Mirrors the intent-matching in the
// offline engine at src/features/paisaAI/paisaAIMock.ts, but is aware of
// the richer server-computed context, anomaly, and forecast.

import type {ChatAnomaly, ChatFinancialContext, ChatForecast, ParsedExpense} from './types.ts';

function formatCurrency(amount: number): string {
  return `₹${new Intl.NumberFormat('en-IN', {maximumFractionDigits: 0}).format(Math.round(Math.abs(amount)))}`;
}

function expenseAcknowledgement(parsedExpense: ParsedExpense): string {
  const amount = formatCurrency(parsedExpense.amount);
  if (parsedExpense.merchant && parsedExpense.merchant !== parsedExpense.category) {
    return `Got it! I found ${amount} for ${parsedExpense.merchant} under ${parsedExpense.category}.`;
  }
  return `Got it! I found ${amount} under ${parsedExpense.category}.`;
}

export function buildFallbackReply(
  message: string,
  context: ChatFinancialContext,
  parsedExpense: ParsedExpense | null,
  anomaly: ChatAnomaly | null,
  forecast: ChatForecast | null,
): string {
  if (parsedExpense) {
    return expenseAcknowledgement(parsedExpense);
  }

  const lower = message.toLowerCase();

  if (/how much (can i|to) spend|left to spend|remaining|budget left/.test(lower)) {
    return `You can still spend ${formatCurrency(Math.max(0, context.remaining))} this month — about ${formatCurrency(
      context.dailySafe,
    )} a day for the next ${context.daysLeft} day${context.daysLeft === 1 ? '' : 's'}.`;
  }

  if (/spend(ing)? this month|show my spend|total spend/.test(lower)) {
    return `You've spent ${formatCurrency(context.spentThisMonth)} this month against a ${formatCurrency(
      context.monthlyBudget,
    )} budget.`;
  }

  if (/top categor|biggest spend|where.*(money|spend)/.test(lower)) {
    return context.topCategory
      ? `${context.topCategory.name} is your top category this month at ${formatCurrency(context.topCategory.amount)}.`
      : "You haven't logged much spending yet this month.";
  }

  if (forecast?.willOverbudget && forecast.message) {
    return forecast.message;
  }

  if (anomaly) {
    return anomaly.message;
  }

  return 'Hmm, I couldn\'t quite understand that. Try something like "Spent 500 on lunch at Subway" or ask "How much can I spend today?"';
}
