import { ParsedExpense } from './types';
import { formatMoney } from '../../lib/formatMoney';

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

export function generateAIResponse(parsed: ParsedExpense, currencySymbol: string): string {
  const formattedAmount = formatMoney(parsed.amount, currencySymbol, {
    decimals: parsed.amount % 1 === 0 ? 0 : 2,
  });
  
  if (parsed.merchant && parsed.merchant !== parsed.category && parsed.merchant !== parsed.subcategory) {
    return `Got it! I found an expense of ${formattedAmount} for ${parsed.merchant} under ${parsed.category} → ${parsed.subcategory}.`;
  }
  return `Got it! I found an expense of ${formattedAmount} under ${parsed.category} → ${parsed.subcategory}.`;
}
