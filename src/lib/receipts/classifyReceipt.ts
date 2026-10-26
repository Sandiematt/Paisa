// Decides whether a scanned receipt is money going out (a purchase) or coming
// in (a refund, credit note, payslip), and which category it most likely
// belongs to. Rule-based and explainable: every decision carries the reasons
// the review screen shows the user.

import {MoneyFlow} from '../supabase/database.types';
import {
  ReceiptClassification,
  ReceiptConfidence,
  ReceiptLineItem,
} from './types';

type Signal = {pattern: RegExp; weight: number; reason: string};

const INCOME_SIGNALS: Signal[] = [
  {pattern: /\bcredit\s*note\b/i, weight: 3, reason: 'It is a credit note'},
  {
    pattern:
      /\b(pay\s*slip|payslip|salary\s*slip|net\s*pay|take\s*home\s*pay|gross\s*earnings|stipend)\b/i,
    weight: 3,
    reason: 'It looks like a payslip',
  },
  {
    pattern: /\b(refund(ed)?|amount\s*refunded)\b/i,
    weight: 2,
    reason: 'It mentions a refund',
  },
  {
    pattern:
      /\b((return|exchange)\s*(receipt|slip|note|invoice)|goods\s*returned|returned\s*items?|sales?\s*return)\b/i,
    weight: 2,
    reason: 'It is a return receipt',
  },
  {
    pattern:
      /\b((amount\s*)?(has\s*been\s*|was\s*)?credited\s*(to|in)(to)?\s*(your|a\/c|account|wallet|card))\b/i,
    weight: 2,
    reason: 'Money was credited to you',
  },
  {
    pattern:
      /\b(reimburse(ment|d)|cashback\s*(credited|received)|interest\s*credited|dividend)\b/i,
    weight: 2,
    reason: 'It records money paid to you',
  },
];

const EXPENSE_SIGNALS: Signal[] = [
  {
    pattern:
      /\b((total\s*)?amount\s*payable|net\s*payable|amount\s*due|balance\s*due|to\s*pay)\b/i,
    weight: 2,
    reason: 'It shows an amount to pay',
  },
  {
    pattern:
      /\b(debited|paid\s*(by|via|using|with)|payment\s*mode|tendered|change\s*due)\b/i,
    weight: 1,
    reason: 'It was paid at the counter',
  },
  {
    pattern:
      /\b(tax\s*invoice|retail\s*invoice|bill\s*of\s*supply|cash\s*memo|invoice|bill)\b/i,
    weight: 1,
    reason: 'It is a bill or tax invoice',
  },
  {
    pattern:
      /\bthank\s*you\s*for\s*(shopping|visiting|dining|your\s*(order|purchase))\b/i,
    weight: 1,
    reason: 'It thanks you for a purchase',
  },
];

function score(lines: string[], signals: Signal[]) {
  const text = lines.join('\n');
  let total = 0;
  const reasons: {weight: number; reason: string}[] = [];
  for (const signal of signals) {
    if (signal.pattern.test(text)) {
      total += signal.weight;
      reasons.push(signal);
    }
  }
  return {total, reasons};
}

function confidenceFor(margin: number): ReceiptConfidence {
  if (margin >= 3) {
    return 'high';
  }
  return margin >= 1 ? 'medium' : 'low';
}

/**
 * `netSign` is the sign of what the receipt adds up to: negative when the
 * total is printed as a credit or returns outweigh purchases.
 */
export function classifyReceipt(input: {
  lines: string[];
  netSign: -1 | 0 | 1;
  items: ReceiptLineItem[];
}): ReceiptClassification {
  const income = score(input.lines, INCOME_SIGNALS);
  const expense = score(input.lines, EXPENSE_SIGNALS);

  if (input.netSign < 0) {
    income.total += 3;
    income.reasons.unshift({
      weight: 3,
      reason: 'Returns and credits outweigh purchases',
    });
  }
  // A credit note or payslip lists earnings and returns, not purchases.
  const incomeDocument = INCOME_SIGNALS.slice(0, 2).some(signal =>
    income.reasons.includes(signal),
  );
  const purchases = input.items.filter(item => item.flow === 'debit').length;
  if (purchases > 0 && input.netSign > 0 && !incomeDocument) {
    expense.total += 2;
    expense.reasons.unshift({
      weight: 2,
      reason:
        purchases === 1 ? '1 purchased item' : `${purchases} purchased items`,
    });
  }

  // Receipts are purchases unless the content says otherwise.
  const type: MoneyFlow = income.total > expense.total ? 'income' : 'expense';
  const winner = type === 'income' ? income : expense;
  const margin = Math.abs(income.total - expense.total);
  const reasons = [...winner.reasons]
    .sort((a, b) => b.weight - a.weight)
    .map(item => item.reason)
    .slice(0, 2);

  return {
    type,
    confidence: winner.total === 0 ? 'low' : confidenceFor(margin),
    reasons: reasons.length ? reasons : ['Receipts are purchases by default'],
  };
}

// Category ids match the grids on the Add transaction screen.
const EXPENSE_CATEGORIES: [string, RegExp][] = [
  [
    'health',
    /\b(pharmacy|pharma|chemists?|medic(al|als|ine|os)|hospital|clinic|diagnostics?|pathology|labs?|apollo|medplus|netmeds|1mg|dental|tablets?|syrup|capsules?)\b/i,
  ],
  [
    'transport',
    /\b(petrol|diesel|fuel|filling\s*station|indian\s*oil|iocl|bharat\s*petroleum|bpcl|hpcl|hindustan\s*petroleum|shell|uber|ola|rapido|metro|parking|toll|fastag|cab|taxi|auto\s*rickshaw)\b/i,
  ],
  [
    'travel',
    /\b(airlines?|airways|flight|indigo|vistara|air\s*india|irctc|railways?|boarding\s*pass|hotel\s*stay|room\s*(charges?|tariff)|resort|booking\.com|makemytrip|goibibo|check[-\s]*in|check[-\s]*out)\b/i,
  ],
  [
    'bills',
    /\b(electricity|power\s*bill|bescom|tneb|msedcl|water\s*bill|gas\s*bill|lpg|broadband|internet|wi-?fi|recharge|postpaid|prepaid|airtel|jio|vodafone|\bvi\b|bsnl|dth|tata\s*play|utility)\b/i,
  ],
  [
    'entertainment',
    /\b(cinemas?|movies?|pvr|inox|cinepolis|theatre|theater|bookmyshow|concert|gaming|amusement|bowling|tickets?\s*for)\b/i,
  ],
  [
    'education',
    /\b(school|college|universit(y|ies)|tuition|coaching|course|exam\s*fee|books?\s*(store|depot)|stationery|stationers)\b/i,
  ],
  [
    'dining',
    /\b(restaurants?|caf[eé]s?|coffee|bistro|diner|dhaba|bakery|bakers|kitchen|eatery|food\s*court|pizza|burger|biryani|swiggy|zomato|starbucks|mcdonald'?s|kfc|domino'?s|subway|bar|brew(ery|ing)?|pub|lounge|kot|dine[-\s]*in|take\s*away|parcel)\b/i,
  ],
  [
    'groceries',
    /\b(supermarkets?|super\s*market|hypermarket|grocer(y|ies)|kirana|provision\s*store|mart|d\s*-?\s*mart|big\s*bazaar|more\s*retail|reliance\s*(fresh|smart)|spencer'?s|nature'?s\s*basket|blinkit|zepto|instamart|bigbasket|vegetables?|fruits?|dairy|milk|bread|eggs|atta|rice|dal|sugar|oil)\b/i,
  ],
  [
    'shopping',
    /\b(fashion|apparel|garments?|clothing|footwear|shoes|lifestyle|westside|pantaloons|max\s*fashion|zara|h&m|decathlon|electronics|croma|reliance\s*digital|vijay\s*sales|amazon|flipkart|myntra|ajio|nykaa|mall|boutique|jewell?ers?|cosmetics)\b/i,
  ],
  [
    'housing',
    /\b(rent\s*receipt|house\s*rent|maintenance\s*charges?|society\s*maintenance|plumb(er|ing)|electrician|hardware|furniture|home\s*centre|ikea|pepperfry)\b/i,
  ],
];

/**
 * Best guess at a category id from the Add screen's grid, or null when
 * nothing on the receipt points anywhere. The merchant name is checked
 * before the rest of the text, so "Apollo Pharmacy" beats a "Bread" item.
 */
export function suggestCategory(input: {
  type: MoneyFlow;
  merchant: string | null;
  lines: string[];
}): string | null {
  const text = input.lines.join('\n');
  if (input.type === 'income') {
    if (INCOME_SIGNALS[1].pattern.test(text)) {
      return 'salary';
    }
    if (/\b(refund|return|credit\s*note|exchange|reversal)/i.test(text)) {
      return 'refund';
    }
    return 'other';
  }
  if (input.merchant) {
    const byName = EXPENSE_CATEGORIES.find(([, pattern]) =>
      pattern.test(input.merchant ?? ''),
    );
    if (byName) {
      return byName[0];
    }
  }
  // Otherwise the category most lines point at; a lone "bar" of chocolate
  // should not turn a grocery run into dining.
  let best: {id: string; hits: number} | null = null;
  for (const [id, pattern] of EXPENSE_CATEGORIES) {
    const hits = input.lines.filter(line => pattern.test(line)).length;
    if (hits > 0 && (!best || hits > best.hits)) {
      best = {id, hits};
    }
  }
  return best?.id ?? null;
}
