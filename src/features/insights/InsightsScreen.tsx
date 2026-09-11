import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Screen, AppText } from '../../components/ui';
import { colors, spacing, radii, layout } from '../../theme';
import { formatMoney } from '../../lib/formatMoney';
import { useFloatingNavClearance, useFloatingNavScroll } from '../NavBar/FloatingNavScroll';
import { AreaChart, DonutChart } from '../home/charts';
import { insightsData } from './insightsPlaceholder';
import { BarChart } from './InsightsCharts';

export type InsightsScreenProps = {
  currencySymbol: string;
};

export function InsightsScreen({ currencySymbol }: InsightsScreenProps) {
  const navClearance = useFloatingNavClearance();
  const navScroll = useFloatingNavScroll();
  const data = insightsData(currencySymbol);

  const donutSlices = data.categories.map(cat => ({
    id: cat.id,
    label: cat.label,
    color: cat.color,
    percent: cat.percent,
  }));

  const isIncrease = data.changePct > 0;
  const badgeColor = isIncrease ? colors.coral : colors.positive;
  const badgeText = `${isIncrease ? '↑' : '↓'}${Math.abs(data.changePct)}% vs ${data.previousMonthLabel}`;

  const highlightLabel = `${data.highlightStamp} · ${formatMoney(
    data.highlightValue,
    currencySymbol,
    {decimals: 0},
  )}`;

  const xLabels = data.dailySeries.map((_, i) => String(i + 1));

  return (
    <Screen edges={['top']}>
      <ScrollView 
        style={styles.scroll} 
        contentContainerStyle={[
          styles.content,
          {paddingBottom: spacing.section + navClearance},
        ]}
        onScroll={navScroll.onScroll}
        scrollEventThrottle={navScroll.scrollEventThrottle}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <AppText variant="display">Insights</AppText>
        </View>

        {/* Card 1: Spending Overview */}
        <View style={styles.card}>
          <AppText variant="caption" style={styles.kicker}>
            TOTAL SPENDING · {data.monthLabel.toUpperCase()}
          </AppText>
          <View style={styles.heroRow}>
            <AppText variant="numeric" style={styles.heroAmount}>
              {formatMoney(data.currentMonthTotal, currencySymbol, { decimals: 0 })}
            </AppText>
            <View style={styles.badgeWrapper}>
              <AppText variant="label" style={{ color: badgeColor }}>
                {badgeText}
              </AppText>
            </View>
          </View>
          <View style={styles.chartWrapper}>
            <AreaChart
              values={data.dailySeries}
              highlightIndex={data.highlightIndex}
              highlightLabel={highlightLabel}
              xLabels={xLabels}
            />
          </View>
        </View>

        {/* Card 2: Category Breakdown */}
        <View style={styles.card}>
          <AppText variant="heading" style={styles.cardTitle}>Where your money goes</AppText>
          <View style={styles.donutContainer}>
            <DonutChart slices={donutSlices} size={132}>
              <AppText variant="caption" color={colors.inkMuted} style={styles.kicker}>
                Spent
              </AppText>
              <AppText variant="heading">
                {formatMoney(data.currentMonthTotal, currencySymbol, {decimals: 0})}
              </AppText>
            </DonutChart>
          </View>
          <View style={styles.legend}>
            {data.categories.map(cat => (
              <View key={cat.id} style={styles.legendRow}>
                <View style={styles.legendLeft}>
                  <View style={[styles.swatch, { backgroundColor: cat.color }]} />
                  <AppText variant="body">{cat.emoji}</AppText>
                  <AppText variant="body">{cat.label}</AppText>
                </View>
                <View style={styles.legendRight}>
                  <AppText variant="bodyStrong">
                    {formatMoney(cat.amount, currencySymbol, { decimals: 0 })}
                  </AppText>
                  <AppText variant="body" style={styles.percentText}>
                    {cat.percent}%
                  </AppText>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Card 3: Spending Trends */}
        <View style={styles.card}>
          <AppText variant="heading" style={styles.cardTitle}>Daily spending pattern</AppText>
          <BarChart data={data.weekdayTrend} highlightMax={true} />
          <View style={styles.chipRow}>
            <View style={styles.chip}>
              <AppText variant="label" style={styles.chipText}>18% more on food this month</AppText>
            </View>
            <View style={styles.chip}>
              <AppText variant="label" style={styles.chipText}>Highest spending on weekends</AppText>
            </View>
          </View>
        </View>

        {/* Card 4: Smart Insights */}
        <View style={styles.card}>
          <AppText variant="heading" style={styles.cardTitle}>Smart Insights ✨</AppText>
          {data.smartInsights.map(insight => (
            <View key={insight.id} style={styles.insightRow}>
              <AppText variant="body">{insight.emoji}</AppText>
              <AppText variant="body" style={styles.insightText}>{insight.text}</AppText>
            </View>
          ))}
        </View>

      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.section,
  },
  header: {
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
    marginBottom: spacing.md,
  },
  kicker: {
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginBottom: spacing.xs,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: spacing.md,
  },
  heroAmount: {
    marginRight: spacing.md,
  },
  badgeWrapper: {
    paddingBottom: 2,
  },
  chartWrapper: {
    marginTop: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  cardTitle: {
    marginBottom: spacing.lg,
  },
  donutContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  legend: {
    gap: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  legendLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  legendRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  percentText: {
    color: colors.inkMuted,
    width: 40,
    textAlign: 'right',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  chip: {
    backgroundColor: colors.accentSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
  },
  chipText: {
    color: colors.accentPress,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.canvasSunk,
    borderRadius: radii.input,
    padding: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  insightText: {
    flex: 1,
  },
});
