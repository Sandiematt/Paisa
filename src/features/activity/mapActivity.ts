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

export function matchesQuery(item: ActivityTransaction, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  const haystack = [
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
  ]
    .join(' ')
    .toLowerCase();

  return normalized
    .split(/\s+/)
    .every(token => haystack.includes(token.replace(/,/g, '')));
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
