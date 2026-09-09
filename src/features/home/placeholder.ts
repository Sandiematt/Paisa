import {colors} from '../../theme';

export type HomeRange = 'week' | 'month' | 'year';

export type SpendSlice = {
  id: string;
  label: string;
  color: string;
  percent: number;
};

export type HomePlaceholder = {
  rangeLabel: string;
  compareLabel: string;
  net: number;
  changePct: number;
  income: number;
  spent: number;
  series: number[];
  highlightIndex: number;
  highlightValue: number;
  highlightStamp: string;
  slices: SpendSlice[];
  health: number;
  healthDelta: number;
};

const SLICES: SpendSlice[] = [
  {id: 'housing', label: 'Housing', color: colors.accent, percent: 48},
  {id: 'dining', label: 'Dining', color: colors.coral, percent: 16},
  {id: 'shopping', label: 'Shopping', color: colors.teal, percent: 13},
  {id: 'groceries', label: 'Groceries', color: colors.positive, percent: 11},
  {id: 'other', label: 'Everything else', color: colors.inkMuted, percent: 12},
];

function monthName(date: Date): string {
  return date.toLocaleDateString('en-US', {month: 'long'}).toUpperCase();
}

function previousMonthName(date: Date): string {
  const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return prev.toLocaleDateString('en-US', {month: 'long'});
}

/** Stand-in report numbers until live totals exist. */
export function homePlaceholder(range: HomeRange, now = new Date()): HomePlaceholder {
  if (range === 'week') {
    return {
      rangeLabel: 'THIS WEEK',
      compareLabel: 'vs last week',
      net: 418.6,
      changePct: 6,
      income: 1560,
      spent: 1141.4,
      series: [210, 260, 240, 310, 280, 360, 418],
      highlightIndex: 5,
      highlightValue: 360,
      highlightStamp: 'SAT',
      slices: SLICES,
      health: 79,
      healthDelta: 2,
    };
  }

  if (range === 'year') {
    return {
      rangeLabel: String(now.getFullYear()),
      compareLabel: 'vs last year',
      net: 18420,
      changePct: 11,
      income: 74880,
      spent: 56460,
      series: [
        920, 1100, 980, 1240, 1180, 1410, 1320, 1560, 1480, 1710, 1640, 1842,
      ],
      highlightIndex: 9,
      highlightValue: 1710,
      highlightStamp: 'OCT',
      slices: SLICES,
      health: 84,
      healthDelta: 5,
    };
  }

  return {
    rangeLabel: monthName(now),
    compareLabel: `vs ${previousMonthName(now)}`,
    net: 2362.18,
    changePct: 9,
    income: 6240,
    spent: 3878,
    series: [
      1480, 1520, 1490, 1610, 1580, 1720, 1680, 1810, 1760, 1890, 1840, 1980,
      1920, 2050, 2010, 2140, 2080, 2210, 2170, 2290, 2240, 2380, 2320, 2362,
    ],
    highlightIndex: 21,
    highlightValue: 2380,
    highlightStamp: '24',
    slices: SLICES,
    health: 82,
    healthDelta: 4,
  };
}
