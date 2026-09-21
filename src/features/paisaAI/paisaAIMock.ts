import { ParsedExpense } from './types';
import { formatMoney } from '../../lib/formatMoney';
import { ChatTone, sendChatMessage } from '../../lib/supabase/chat';

export function parseExpenseFromText(input: string): ParsedExpense | null {
  // Extract Amount
  const amountRegex = /(?:₹|rs\.?\s*)(\d[\d,]*\.?\d*)|\b(\d{2,}(?:\.\d{1,2})?)\b/i;
  const amountMatch = input.match(amountRegex);
  
  if (!amountMatch) {
    return null;
  }

  const amountStr = amountMatch[1] || amountMatch[2];
  const amount = parseFloat(amountStr.replace(/,/g, ''));
  if (isNaN(amount)) return null;

  // Extract Category
  const lowerInput = input.toLowerCase();
  let category = 'Other';
  let subcategory = 'General';

  if (/coffee|chai|tea/.test(lowerInput)) {
    category = 'Food'; subcategory = 'Coffee';
  } else if (/lunch|dinner|breakfast|ate|meal|biryani|barbecue/.test(lowerInput)) {
    category = 'Food'; subcategory = 'Dining';
  } else if (/grocery|groceries|vegetables|fruits/.test(lowerInput)) {
    category = 'Food'; subcategory = 'Groceries';
  } else if (/uber|ola|cab|taxi|auto|rickshaw/.test(lowerInput)) {
    category = 'Travel'; subcategory = 'Ride';
  } else if (/bus|train|metro/.test(lowerInput)) {
    category = 'Travel'; subcategory = 'Transit';
  } else if (/flight|hotel/.test(lowerInput)) {
    category = 'Travel'; subcategory = 'Trip';
  } else if (/shirt|shoes|jeans|clothes|bought/.test(lowerInput)) {
    category = 'Shopping'; subcategory = 'Clothing';
  } else if (/amazon|flipkart|online/.test(lowerInput)) {
    category = 'Shopping'; subcategory = 'Online';
  } else if (/electricity|wifi|internet|rent|water|gas/.test(lowerInput)) {
    category = 'Bills'; subcategory = 'Utilities';
  } else if (/recharge|mobile/.test(lowerInput)) {
    category = 'Bills'; subcategory = 'Phone';
  } else if (/movie|netflix|spotify|game/.test(lowerInput)) {
    category = 'Entertainment'; subcategory = 'Media';
  } else if (/gym|medicine|doctor|hospital/.test(lowerInput)) {
    category = 'Health'; subcategory = 'Medical';
  }

  // Extract Merchant
  let merchant = '';
  
  // Specific app/brand recognition
  if (/uber/i.test(lowerInput)) {
    const toMatch = input.match(/to\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
    merchant = toMatch ? `Uber (${toMatch[1].trim()})` : 'Uber';
  } else if (/ola/i.test(lowerInput)) {
    const toMatch = input.match(/to\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)?)/i);
    merchant = toMatch ? `Ola (${toMatch[1].trim()})` : 'Ola';
  } else if (/starbucks/i.test(lowerInput)) {
    merchant = 'Starbucks';
  } else if (/subway/i.test(lowerInput)) {
    merchant = 'Subway';
  } else if (/mcdonald|mcd/i.test(lowerInput)) {
    merchant = "McDonald's";
  } else if (/zara/i.test(lowerInput)) {
    merchant = 'Zara';
  } else if (/netflix/i.test(lowerInput)) {
    merchant = 'Netflix';
  } else if (/spotify/i.test(lowerInput)) {
    merchant = 'Spotify';
  } else if (/amazon/i.test(lowerInput)) {
    merchant = 'Amazon';
  } else if (/flipkart/i.test(lowerInput)) {
    merchant = 'Flipkart';
  } else {
    // Look for preposition: at / from / in / for / to
    const prepRegex = /(?:at|from|to)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,2})/i;
    const prepMatch = input.match(prepRegex);
    if (prepMatch && prepMatch[1]) {
      merchant = prepMatch[1].trim();
    } else {
      const fallbackRegex = /(?:at|from|to)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,2})/i;
      const fallbackMatch = input.match(fallbackRegex);
      if (fallbackMatch && fallbackMatch[1]) {
        merchant = fallbackMatch[1].trim();
        merchant = merchant.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      }
    }
  }

  // Fallback to subcategory or category if no merchant identified
  if (!merchant || merchant.toLowerCase() === category.toLowerCase()) {
    merchant = subcategory !== 'General' ? subcategory : category;
  }

  // Extract Date
  const today = new Date();
  let date = today.toISOString().split('T')[0];
  
  if (lowerInput.includes('yesterday')) {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    date = yesterday.toISOString().split('T')[0];
  } else if (lowerInput.includes('last week')) {
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);
    date = lastWeek.toISOString().split('T')[0];
  }

  // Extract Payment Method
  let paymentMethod: string | undefined = undefined;
  if (/upi|gpay|phonepe/.test(lowerInput)) {
    paymentMethod = 'UPI';
  } else if (/card|credit|debit/.test(lowerInput)) {
    paymentMethod = 'Card';
  } else if (/cash/.test(lowerInput)) {
    paymentMethod = 'Cash';
  }

  return {
    amount,
    category,
    subcategory,
    merchant,
    date,
    description: input,
    paymentMethod,
  };
}

export type CompanionContext = {
  currencySymbol: string;
  spent: number;
  remainingBudget: number;
  budget: number;
  periodLabel: string;
};

export function generateCompanionReply(
  input: string,
  context: CompanionContext,
): {text: string; parsedExpense?: ParsedExpense} {
  const lower = input.toLowerCase();
  const spent = formatMoney(context.spent, context.currencySymbol, {decimals: 0});
  const remaining = formatMoney(Math.max(0, context.remainingBudget), context.currencySymbol, {
    decimals: 0,
  });
  const budget = formatMoney(context.budget, context.currencySymbol, {decimals: 0});

  if (/spend(ing)? this (week|month|year)|show my spend/.test(lower)) {
    return {
      text: `You've spent ${spent} ${context.periodLabel}, against a ${budget} budget.`,
    };
  }
  if (/how much can i spend|left to spend|remaining/.test(lower)) {
    return {
      text: `You can still spend ${remaining} before you hit this period's ${budget} budget.`,
    };
  }
  if (/savings goal/.test(lower)) {
    return {
      text: 'I can help you set a savings goal. Open Profile to update monthly savings, or tell me an amount to log as savings.',
    };
  }

  const parsed = parseExpenseFromText(input);
  if (parsed) {
    return {text: generateAIResponse(parsed, context.currencySymbol), parsedExpense: parsed};
  }

  return {
    text: 'Hmm, I couldn\'t quite understand that. Try something like "Spent 500 on lunch at Subway".',
  };
}

export function generateAIResponse(parsed: ParsedExpense, currencySymbol: string): string {
  const formattedAmount = formatMoney(parsed.amount, currencySymbol, {
    decimals: parsed.amount % 1 === 0 ? 0 : 2,
  });
  
  if (parsed.merchant && parsed.merchant !== parsed.category && parsed.merchant !== parsed.subcategory) {
    return `Got it! I found an expense of ${formattedAmount} for ${parsed.merchant} under ${parsed.category} → ${parsed.subcategory}.`;
  }
  return `Got it! I found an expense of ${formattedAmount} under ${parsed.category} → ${parsed.subcategory}.`;
}

export type CompanionReplyResult = {
  text: string;
  parsedExpense?: ParsedExpense;
  suggestions?: string[];
  aiGenerated: boolean;
};

/**
 * Tries the `paisaai-chat` Edge Function first — real Gemini-backed
 * replies, expense parsing against the user's own categories, and
 * anomaly/forecast awareness, all computed server-side from the user's
 * real transactions. Falls back to the fully offline pattern-matching
 * engine above (`generateCompanionReply`) if the network call fails (no
 * connection, expired session, Edge Function down), so the chat never
 * goes silent.
 */
export async function getCompanionReply(
  input: string,
  context: CompanionContext,
  tone: ChatTone = 'short',
): Promise<CompanionReplyResult> {
  try {
    const response = await sendChatMessage({message: input, tone});
    return {
      text: response.text,
      parsedExpense: response.parsedExpense,
      suggestions: response.suggestions,
      aiGenerated: response.aiGenerated,
    };
  } catch (error) {
    console.warn('paisaAI: falling back to offline reply', error);
    const fallback = generateCompanionReply(input, context);
    return {
      text: fallback.text,
      parsedExpense: fallback.parsedExpense,
      aiGenerated: false,
    };
  }
}
