import {CategoryRow} from '../../lib/categoriesStore';
import {categoryTint} from '../add/categoryIcons';
import {isLedgerSpecial, TransactionRow} from '../../lib/transactionsStore';
import {parseCalendarDate} from '../home/homeReport';

export type RecentSpendChip = {
  id: string;
  amount: number;
  title: string;
  subtitle: string;
  slug: string;
  bg: string;
  fg: string;
};

function slugFor(category: CategoryRow | undefined): string {
  return category?.slug ?? 'other';
}

function timeLabel(row: TransactionRow, now: Date): string {
  const day = parseCalendarDate(row.transactionDate);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - day.getTime()) / 86400000);

  if (diffDays === 0) {
    const stamp = new Date(row.createdAt);
    if (!Number.isNaN(stamp.getTime())) {
      return stamp.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      });
    }
    return 'Today';
  }
  if (diffDays === 1) {
    return 'Yesterday';
  }
  if (diffDays > 1 && diffDays < 7) {
    return day.toLocaleDateString('en-US', {weekday: 'short'});
  }
  return day.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
}

/** Most recent expenses, newest first, for the Recent Spending strip. */
export function buildRecentSpending(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  limit = 3,
  now = new Date(),
): RecentSpendChip[] {
  const rows = transactions
    .filter(row => row.type === 'expense' && row.amount > 0 && !isLedgerSpecial(row))
    .sort((a, b) => {
      if (a.transactionDate !== b.transactionDate) {
        return a.transactionDate < b.transactionDate ? 1 : -1;
      }
      return a.createdAt < b.createdAt ? 1 : -1;
    })
    .slice(0, limit);

  return rows.map(row => {
    const category = categories.find(item => item.id === row.categoryId);
    const slug = slugFor(category);
    const tint = categoryTint(slug);
    const merchant = row.merchant?.trim() || category?.name || 'Expense';
    const title = row.description?.trim() || category?.name || merchant;

    return {
      id: row.id,
      amount: row.amount,
      title,
      subtitle: `${merchant} • ${timeLabel(row, now)}`,
      slug,
      bg: tint.bg,
      fg: tint.fg,
    };
  });
}
