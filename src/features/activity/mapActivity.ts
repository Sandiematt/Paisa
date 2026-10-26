import {CategoryRow} from '../../lib/categoriesStore';
import {
  TransactionRow,
  isLedgerSpecial,
} from '../../lib/transactionsStore';
import {ActivityFilter, ActivityTransaction} from './types';

export function toActivityItem(
  row: TransactionRow,
  categories: CategoryRow[],
): ActivityTransaction {
  const category = categories.find(item => item.id === row.categoryId);
  const signed = row.type === 'income' ? row.amount : -row.amount;
  const merchant =
    row.merchant?.trim() ||
    row.description?.trim() ||
    category?.name ||
    'Transaction';

  return {
    id: row.id,
    merchant,
    category: category?.name ?? (row.type === 'income' ? 'Income' : 'Expense'),
    categorySlug: category?.slug ?? (row.type === 'income' ? 'salary' : 'other'),
    categoryColor: category?.color,
    account: row.paymentMethod?.trim() || 'Wallet',
    amount: signed,
    kind: row.type,
    recurring: row.isRecurring,
    note: row.notes ?? '',
    date: row.transactionDate,
    source: row,
  };
}

export function ledgerForActivity(
  rows: TransactionRow[],
  categories: CategoryRow[],
): ActivityTransaction[] {
  return rows
    .filter(row => !isLedgerSpecial(row))
    .map(row => toActivityItem(row, categories))
    .sort((a, b) => {
      if (a.date !== b.date) {
        return a.date < b.date ? 1 : -1;
      }
      const aCreated = a.source?.createdAt ?? '';
      const bCreated = b.source?.createdAt ?? '';
      return aCreated < bCreated ? 1 : -1;
    });
}

function amountNeedles(amount: number): string[] {
  const abs = Math.abs(amount);
  const fixed = abs.toFixed(2);
  return [fixed, String(Number(fixed)), String(Math.trunc(abs))];
}

/**
 * Lowercased, with punctuation dropped (but not the decimal point, so
 * amounts still match), so "ravis" finds "Ravi's" and "w/o" finds "wo".
 */
function normalizeSearch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}.\s]+/gu, '')
    .replace(/\s+/g, ' ');
}

/** The words of a search, each of which must appear somewhere in a match. */
export function searchTokens(query: string): string[] {
  return normalizeSearch(query.trim()).split(' ').filter(Boolean);
}

export function matchesQuery(item: ActivityTransaction, query: string): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) {
    return true;
  }

  const haystack = normalizeSearch(
    [
      item.merchant,
      item.category,
      item.account,
      item.note,
      item.kind,
      item.date,
      item.source?.description ?? '',
      item.source?.merchant ?? '',
      item.recurring ? 'recurring repeats' : '',
      ...amountNeedles(item.amount),
    ].join(' '),
  );

  return tokens.every(token => haystack.includes(token));
}

export type HighlightPart = {text: string; match: boolean};

/**
 * Splits text into plain and matching runs for the search words, ignoring
 * case, so a result can show why it matched (a word in its note, say).
 */
export function highlightParts(
  text: string,
  tokens: string[],
): HighlightPart[] {
  const needles = tokens.filter(token => token.length > 0);
  if (!text || needles.length === 0) {
    return [{text, match: false}];
  }
  const lower = text.toLowerCase();
  const marked = new Array<boolean>(text.length).fill(false);
  for (const needle of needles) {
    let from = lower.indexOf(needle);
    while (from !== -1) {
      marked.fill(true, from, from + needle.length);
      from = lower.indexOf(needle, from + needle.length);
    }
  }
  const parts: HighlightPart[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const last = parts[parts.length - 1];
    if (last && last.match === marked[i]) {
      last.text += text[i];
    } else {
      parts.push({text: text[i], match: marked[i]});
    }
  }
  return parts;
}

export function matchesFilter(
  item: ActivityTransaction,
  filter: ActivityFilter,
): boolean {
  switch (filter) {
    case 'expenses':
      return item.kind === 'expense';
    case 'income':
      return item.kind === 'income';
    case 'recurring':
      return item.recurring;
    default:
      return true;
  }
}
