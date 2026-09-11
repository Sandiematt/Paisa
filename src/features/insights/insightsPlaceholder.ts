import { colors } from '../../theme';
import { formatMoney } from '../../lib/formatMoney';

export type InsightsCategory = {
  id: string;
  label: string;
  emoji: string;
  color: string;
  amount: number;
  percent: number;
};

export type SpendingTrend = {
  label: string;
  value: number;
};

export type SmartInsight = {
  id: string;
  emoji: string;
  text: string;
};

export type InsightsData = {
  currentMonthTotal: number;
  previousMonthTotal: number;
  changePct: number;
  monthLabel: string;
  previousMonthLabel: string;
  dailySeries: number[];
  highlightIndex: number;
  highlightValue: number;
  highlightStamp: string;
  categories: InsightsCategory[];
  weekdayTrend: SpendingTrend[];
  smartInsights: SmartInsight[];
};

export function insightsData(currencySymbol: string): InsightsData {
  const currentMonthTotal = 30000;
  const previousMonthTotal = 26800;
  const changePct = 12;

  const date = new Date();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthLabel = monthNames[date.getMonth()];
  const previousMonthLabel = monthNames[(date.getMonth() - 1 + 12) % 12];

  const categories: InsightsCategory[] = [
    { id: '1', label: 'Food', emoji: '🍕', color: colors.coral, amount: 8400, percent: 28 },
    { id: '2', label: 'Shopping', emoji: '🛍️', color: colors.positive, amount: 6200, percent: 21 },
    { id: '3', label: 'Travel', emoji: '✈️', color: colors.violet, amount: 4800, percent: 16 },
    { id: '4', label: 'Bills', emoji: '📄', color: colors.slate, amount: 4200, percent: 14 },
    { id: '5', label: 'Entertainment', emoji: '🎬', color: colors.accent, amount: 3600, percent: 12 },
    { id: '6', label: 'Other', emoji: '📦', color: colors.teal, amount: 2800, percent: 9 },
  ];

  const weekdayTrend: SpendingTrend[] = [
    { label: 'Mon', value: 850 },
    { label: 'Tue', value: 920 },
    { label: 'Wed', value: 780 },
    { label: 'Thu', value: 1050 },
    { label: 'Fri', value: 1280 },
    { label: 'Sat', value: 1520 },
    { label: 'Sun', value: 1380 },
  ];

  const smartInsights: SmartInsight[] = [
    { id: '1', emoji: '🍕', text: `You spent ${currencySymbol}4,200 on food this week — 12% higher than last week.` },
    { id: '2', emoji: '📈', text: 'Your spending is highest on weekends. Consider setting a weekend budget.' },
    { id: '3', emoji: '💡', text: `Bills are ${currencySymbol}800 lower this month. Great job managing subscriptions!` },
    { id: '4', emoji: '🎯', text: 'You\'ve spent 68% of your monthly budget with 10 days remaining.' },
  ];

  // Realistic daily spending amounts throughout the month (fluctuating with weekend peaks)
  const dailySeries = [
    820, 950, 740, 1100, 1450, 1680, 1520,
    790, 880, 920, 1050, 1390, 1720, 1480,
    810, 900, 850, 1150, 1500, 1850, 1600,
    940, 1020, 1250,
  ];

  const highlightIndex = 19; // Day 20 (Sat peak)
  const highlightValue = dailySeries[highlightIndex];
  const highlightStamp = `Day ${highlightIndex + 1}`;

  return {
    currentMonthTotal,
    previousMonthTotal,
    changePct,
    monthLabel,
    previousMonthLabel,
    dailySeries,
    highlightIndex,
    highlightValue,
    highlightStamp,
    categories,
    weekdayTrend,
    smartInsights,
  };
}
