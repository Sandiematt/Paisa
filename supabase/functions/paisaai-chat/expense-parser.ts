// Expense extraction for Paisa AI chat.
//
// Gemini is only ever used to *extract* fields already present in the
// user's own message — it never invents a number. Every amount Gemini
// returns is checked against the digits that actually appear in the raw
// message (see `numbersIn` / the verification in `parseExpense`) before
// being trusted; if it fails that check, or Gemini is unavailable, we fall
// back to a deterministic keyword/regex parser (mirrors the offline engine
// in src/features/paisaAI/paisaAIMock.ts) so expense logging never breaks.

import {callGeminiJSON} from './gemini-client.ts';
import {geminiExpenseSchema} from './response-schema.ts';
import type {CategoryRef, ParsedExpense} from './types.ts';

const EXPENSE_SYSTEM_PROMPT = `You extract a single expense from one chat message for Paisa, a personal finance app.

You will receive JSON with:
- "message": the user's raw text.
- "today": today's date, YYYY-MM-DD.
- "categories": the user's real expense category names — you may ONLY use one of these exact names for "categoryName", or null if none fit well.

Rules (do not break these):
- If the message does not describe a specific expense (an amount that was spent), respond {"expense": null}.
- "amount" MUST be a number that appears verbatim in "message" (ignore currency symbols, commas, and words like "rupees"/"rs"). Never invent, estimate, or round a different amount.
- "categoryName" must be an exact, case-sensitive match to one of the provided category names, or null if nothing fits.
- "merchant" is the specific business/person paid, e.g. "Starbucks", "Uber", or null if not mentioned.
- "subcategory" is a short 1-2 word description of what it was for, e.g. "Coffee", "Lunch", "Cab ride", or null.
- "date": if the message says "yesterday", "last week", etc, compute the real date relative to "today"; otherwise use "today". Always YYYY-MM-DD, never in the future.
- "paymentMethod" is one of "UPI", "Card", "Cash", or null if not mentioned.
- Respond with ONLY a JSON object of the exact shape: {"expense": {"amount": ..., "merchant": ..., "categoryName": ..., "subcategory": ..., "date": ..., "paymentMethod": ...} | null}. No other keys, no markdown, no code fences.`;

/** Every digit sequence in `text`, with thousands separators stripped, as numbers. */
function numbersIn(text: string): Set<number> {
  const found = text.match(/\d[\d,]*\.?\d*/g) ?? [];
  const numbers = new Set<number>();
  for (const raw of found) {
    const value = Number(raw.replace(/,/g, ''));
    if (Number.isFinite(value)) {
      numbers.add(value);
    }
  }
  return numbers;
}

function clampDate(candidate: string | null | undefined, today: string): string {
  if (!candidate || !/^\d{4}-\d{2}-\d{2}$/.test(candidate)) {
    return today;
  }
  return candidate > today ? today : candidate;
}

function matchCategory(categories: CategoryRef[], name: string | null | undefined): CategoryRef | null {
  if (!name) return null;
  const needle = name.trim().toLowerCase();
  return categories.find(category => category.type === 'expense' && category.name.toLowerCase() === needle) ?? null;
}

// ---------------------------------------------------------------------------
// Deterministic fallback — mirrors the offline regex engine in
// src/features/paisaAI/paisaAIMock.ts, adapted to match against the user's
// real category list (via `slug`) instead of hardcoded labels.
// ---------------------------------------------------------------------------

const KEYWORD_SLUGS: {pattern: RegExp; slug: string; subcategory: string}[] = [
  {pattern: /coffee|chai|\btea\b|starbucks/, slug: 'dining', subcategory: 'Coffee'},
  {
    pattern: /lunch|dinner|breakfast|\bate\b|\bmeal\b|biryani|restaurant|subway|mcdonald|\bmcd\b|zomato|swiggy/,
    slug: 'dining',
    subcategory: 'Dining',
  },
  {pattern: /grocery|groceries|vegetables|fruits|supermarket/, slug: 'groceries', subcategory: 'Groceries'},
  {
    pattern: /\buber\b|\bola\b|\bcab\b|\btaxi\b|\bauto\b|rickshaw|\bbus\b|\btrain\b|\bmetro\b|\bflight\b|petrol|\bfuel\b/,
    slug: 'transport',
    subcategory: 'Ride',
  },
  {pattern: /shirt|shoes|jeans|clothes|\bbought\b|amazon|flipkart|myntra|\bzara\b/, slug: 'shopping', subcategory: 'Shopping'},
  {
    pattern: /electricity|\bwifi\b|internet|\brent\b|water bill|gas bill|recharge|mobile bill/,
    slug: 'bills',
    subcategory: 'Utilities',
  },
  {pattern: /movie|netflix|spotify|\bgame\b|entertainment/, slug: 'entertainment', subcategory: 'Media'},
  {pattern: /\bgym\b|medicine|doctor|hospital|pharmacy/, slug: 'health', subcategory: 'Medical'},
];

function fallbackParse(message: string, categories: CategoryRef[], today: string): ParsedExpense | null {
  const amountMatch = message.match(/(?:₹|rs\.?\s*)(\d[\d,]*\.?\d*)|\b(\d{2,}(?:\.\d{1,2})?)\b/i);
  if (!amountMatch) {
    return null;
  }
  const amountStr = amountMatch[1] || amountMatch[2];
  const amount = Number(amountStr.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  const lower = message.toLowerCase();
  const matched = KEYWORD_SLUGS.find(entry => entry.pattern.test(lower));
  const category =
    (matched ? categories.find(c => c.type === 'expense' && c.slug === matched.slug) : undefined) ??
    categories.find(c => c.type === 'expense' && c.slug === 'other');

  const prepMatch = message.match(/(?:\bat\b|\bfrom\b|\bto\b)\s+([A-Za-z][A-Za-z\s]{1,24})/i);
  const merchant = prepMatch?.[1]?.trim() || matched?.subcategory || category?.name || 'Expense';

  let date = today;
  if (lower.includes('yesterday')) {
    const yesterday = new Date(`${today}T00:00:00.000Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    date = yesterday.toISOString().slice(0, 10);
  }

  let paymentMethod: string | undefined;
  if (/upi|gpay|phonepe/.test(lower)) {
    paymentMethod = 'UPI';
  } else if (/card|credit|debit/.test(lower)) {
    paymentMethod = 'Card';
  } else if (/\bcash\b/.test(lower)) {
    paymentMethod = 'Cash';
  }

  return {
    amount,
    category: category?.name ?? 'Other',
    subcategory: matched?.subcategory ?? category?.name ?? 'General',
    merchant,
    date,
    description: message,
    paymentMethod,
    categoryId: category?.id ?? null,
  };
}

/**
 * Extracts at most one expense from `message`. Tries Gemini first (guarded
 * by a numeric-safety check against the raw text); falls back to a
 * deterministic keyword parser if Gemini is unavailable, times out, or
 * returns an amount that can't be verified. Returns `null` when the
 * message plainly doesn't contain a digit at all — no expense to extract.
 */
export async function parseExpense(message: string, categories: CategoryRef[], today: string): Promise<ParsedExpense | null> {
  const allowedAmounts = numbersIn(message);
  if (allowedAmounts.size === 0) {
    return null;
  }

  const expenseCategoryNames = categories.filter(c => c.type === 'expense').map(c => c.name);

  const raw = await callGeminiJSON({
    systemPrompt: EXPENSE_SYSTEM_PROMPT,
    userContent: JSON.stringify({message, today, categories: expenseCategoryNames}),
    temperature: 0.1,
    maxOutputTokens: 200,
  });

  const parsedResult = raw ? geminiExpenseSchema.safeParse(raw) : null;
  if (parsedResult?.success && parsedResult.data.expense) {
    const candidate = parsedResult.data.expense;
    const amountIsVerified = [...allowedAmounts].some(value => Math.abs(value - candidate.amount) <= 1);

    if (amountIsVerified) {
      const category = matchCategory(categories, candidate.categoryName);
      return {
        amount: candidate.amount,
        category: category?.name ?? 'Other',
        subcategory: candidate.subcategory?.trim() || category?.name || 'General',
        merchant: candidate.merchant?.trim() || category?.name || 'Expense',
        date: clampDate(candidate.date, today),
        description: message,
        paymentMethod: candidate.paymentMethod ?? undefined,
        categoryId: category?.id ?? null,
      };
    }
    console.warn('paisaai-chat: discarded Gemini expense with an unverified amount');
  }

  return fallbackParse(message, categories, today);
}
