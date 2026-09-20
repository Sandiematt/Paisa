import {CategoryRow} from '../../lib/categoriesStore';
import {
  isLedgerSpecial,
  roundMoney,
  TransactionRow,
} from '../../lib/transactionsStore';
import {
  HomeRange,
  parseCalendarDate,
  periodFor,
} from '../home/homeReport';

export type PaisaCategoryTile = {
  id: string;
  slug: string;
  label: string;
  amount: number;
  bg: string;
  fg: string;
  border: string;
};

const TINT: Record<string, {bg: string; fg: string}> = {
  housing: {bg: '#FDECEA', fg: '#C0523A'},
  dining: {bg: '#FBF0DA', fg: '#C87A1F'},
  groceries: {bg: '#E8F5EE', fg: '#3F7A4E'},
  transport: {bg: '#E7F1FB', fg: '#3D7CC9'},
  bills: {bg: '#EEECE6', fg: '#8A857A'},
  health: {bg: '#FDECEA', fg: '#C0523A'},
  travel: {bg: '#E7F6F4', fg: '#12998B'},
  shopping: {bg: '#F3EEFB', fg: '#7A6BC4'},
  other: {bg: '#EEECE6', fg: '#8A857A'},
};

export type PaisaPace = {
  /** True when spend is tracking below the expected pace for elapsed time. */
  under: boolean;
  pct: number;
};

export type PaisaMonthSummary = {
  spent: number;
  budget: number;
  ratio: number;
  vsLastPct: number | null;
  tiles: PaisaCategoryTile[];
  /** Days remaining in the active period, inclusive of today. */
  daysLeft: number;
  /** Budget minus spent. Can be negative when over budget. */
  remaining: number;
  /** Safe amount left to spend per remaining day. */
  dailySafe: number;
  /** Pace vs. the budget given how much of the period has elapsed. */
  pace: PaisaPace | null;
  /** How many categories actually have spend this period. */
  categoryCount: number;
  /** Share of total spend the top category represents, 0-100. */
  topCategoryPct: number;
  /** The single highest-spend category this period, if any. */
  topCategory: {label: string; amount: number} | null;
};

const FALLBACK_SLUGS = ['dining', 'shopping', 'transport', 'bills'] as const;
const FALLBACK_LABELS: Record<string, string> = {
  dining: 'Food',
  shopping: 'Shopping',
  transport: 'Transport',
  bills: 'Bills',
};

function inRange(isoDate: string, start: Date, end: Date): boolean {
  const value = parseCalendarDate(isoDate).getTime();
  if (Number.isNaN(value)) {
    return false;
  }
  return value >= start.getTime() && value <= end.getTime();
}

function spentIn(rows: TransactionRow[], start: Date, end: Date): TransactionRow[] {
  return rows.filter(
    row =>
      row.type === 'expense' &&
      row.amount > 0 &&
      !isLedgerSpecial(row) &&
      inRange(row.transactionDate, start, end),
  );
}

function slugFor(category: CategoryRow | undefined, label: string): string {
  if (category?.slug) {
    return category.slug;
  }
  const needle = label.trim().toLowerCase();
  if (needle.includes('food') || needle.includes('dining') || needle.includes('groc')) {
    return 'dining';
  }
  if (needle.includes('shop')) {
    return 'shopping';
  }
  if (needle.includes('transport') || needle.includes('travel')) {
    return 'transport';
  }
  if (needle.includes('bill') || needle.includes('hous') || needle.includes('rent')) {
    return 'bills';
  }
  return 'other';
}

function tileFrom(
  id: string,
  slug: string,
  label: string,
  amount: number,
): PaisaCategoryTile {
  const tint = TINT[slug] ?? TINT.other;
  return {
    id,
    slug,
    label,
    amount,
    bg: tint.bg,
    fg: tint.fg,
    border: `${tint.fg}4D`,
  };
}

export function buildPaisaMonthSummary(
  transactions: TransactionRow[],
  categories: CategoryRow[],
  budget: number,
  range: HomeRange,
  now = new Date(),
): PaisaMonthSummary {
  const period = periodFor(range, now);
  const currentRows = spentIn(transactions, period.start, period.end);
  const previousRows = spentIn(transactions, period.prevStart, period.prevEnd);
  const spent = roundMoney(currentRows.reduce((sum, row) => sum + row.amount, 0));
  const previous = roundMoney(previousRows.reduce((sum, row) => sum + row.amount, 0));

  let vsLastPct: number | null = null;
  if (Math.abs(previous) >= 0.005) {
    vsLastPct = Math.round(((spent - previous) / Math.abs(previous)) * 100);
  } else if (Math.abs(spent) < 0.005) {
    vsLastPct = 0;
  }

  const byCategory = new Map<string, number>();
  for (const row of currentRows) {
    const key = row.categoryId ?? 'uncategorized';
    byCategory.set(key, (byCategory.get(key) ?? 0) + row.amount);
  }

  const ranked = [...byCategory.entries()].sort((a, b) => b[1] - a[1]);
  const tiles: PaisaCategoryTile[] = ranked.slice(0, 4).map(([id, amount]) => {
    const category = categories.find(item => item.id === id);
    const label = category?.name ?? FALLBACK_LABELS[slugFor(category, '')] ?? 'Other';
    const slug = slugFor(category, label);
    return tileFrom(id, slug, label, roundMoney(amount));
  });

  for (const slug of FALLBACK_SLUGS) {
    if (tiles.length >= 4) {
      break;
    }
    if (tiles.some(tile => tile.slug === slug)) {
      continue;
    }
    tiles.push(tileFrom(slug, slug, FALLBACK_LABELS[slug], 0));
  }

  const safeBudget = Math.max(0, budget);
  const categoryCount = ranked.filter(([, amount]) => amount > 0).length;
  const topCategoryPct = spent > 0 && ranked.length > 0 ? Math.round((ranked[0][1] / spent) * 100) : 0;
  const topCategory =
    ranked.length > 0 && ranked[0][1] > 0
      ? {
          label: tiles.find(tile => tile.id === ranked[0][0])?.label ?? 'Other',
          amount: roundMoney(ranked[0][1]),
        }
      : null;

  const totalDays = Math.max(
    1,
    Math.round((period.end.getTime() - period.start.getTime()) / 86400000) + 1,
  );
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const elapsedDays = Math.min(
    totalDays,
    Math.max(1, Math.round((today.getTime() - period.start.getTime()) / 86400000) + 1),
  );
  const daysLeft = Math.max(0, totalDays - elapsedDays + 1);
  const remaining = roundMoney(safeBudget - spent);
  const dailySafe = daysLeft > 0 ? roundMoney(Math.max(0, remaining) / daysLeft) : Math.max(0, remaining);

  let pace: PaisaPace | null = null;
  if (safeBudget > 0) {
    const paceBudget = safeBudget * (elapsedDays / totalDays);
    if (paceBudget > 0.005) {
      const diffPct = Math.round(((paceBudget - spent) / paceBudget) * 100);
      pace = {under: diffPct >= 0, pct: Math.abs(diffPct)};
    }
  }

  return {
    spent,
    budget: safeBudget,
    ratio: safeBudget > 0 ? Math.min(1, spent / safeBudget) : 0,
    vsLastPct,
    tiles: tiles.slice(0, 4),
    daysLeft,
    remaining,
    dailySafe,
    pace,
    categoryCount,
    topCategoryPct,
    topCategory,
  };
}

export function periodTitle(range: HomeRange): string {
  if (range === 'week') {
    return 'This Week';
  }
  if (range === 'year') {
    return 'This Year';
  }
  return 'This Month';
}

export function periodCompareLabel(range: HomeRange): string {
  if (range === 'week') {
    return 'last week';
  }
  if (range === 'year') {
    return 'last year';
  }
  return 'last month';
}

/** "OCTOBER" / "THIS WEEK" / "2026" — paired with "Spending" in the header. */
export function periodHeaderLabel(range: HomeRange, now = new Date()): string {
  if (range === 'week') {
    return 'THIS WEEK';
  }
  if (range === 'year') {
    return String(now.getFullYear());
  }
  return now.toLocaleDateString('en-US', {month: 'long'}).toUpperCase();
}
