import React, {useMemo, useState} from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';

import {
  BellGlyph,
  RefreshGlyph,
  TrendUpGlyph,
} from '../../components/icons/Glyphs';
import {
  AppText,
  PressableScale,
  ProgressBar,
  Screen,
  TogglePill,
} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {colors, layout, radii, spacing} from '../../theme';
import {AreaChart, DonutChart, ScoreGauge} from './charts';
import {HomeRange, homePlaceholder} from './placeholder';

type HomeScreenProps = {
  name: string;
  currencySymbol: string;
};

const RANGES: {id: HomeRange; label: string}[] = [
  {id: 'week', label: 'Week'},
  {id: 'month', label: 'Month'},
  {id: 'year', label: 'Year'},
];

export function HomeScreen({name, currencySymbol}: HomeScreenProps) {
  const [range, setRange] = useState<HomeRange>('month');
  const data = useMemo(() => homePlaceholder(range), [range]);
  const initials = initialsFrom(name);

  const highlightLabel = `${data.highlightStamp} · ${formatMoney(
    data.highlightValue,
    currencySymbol,
    {decimals: data.highlightValue % 1 === 0 ? 0 : 2},
  )}`;

  return (
    <Screen edges={['top']}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <AppText variant="display">Sikka</AppText>
            <PressableScale
              onPress={() => {}}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel="Sync now"
              style={styles.syncRow}>
              <RefreshGlyph color={colors.inkMuted} size={12} />
              <View style={styles.liveDot} />
              <AppText variant="caption" color={colors.inkMuted}>
                Updated 2 min ago · Tap to sync
              </AppText>
            </PressableScale>
          </View>
          <View style={styles.headerActions}>
            <PressableScale
              onPress={() => {}}
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel="Notifications"
              style={styles.iconBtn}>
              <BellGlyph color={colors.ink} size={18} />
              <View style={styles.badge} />
            </PressableScale>
            <PressableScale
              onPress={() => {}}
              scaleTo={0.94}
              accessibilityRole="button"
              accessibilityLabel="Profile"
              style={styles.avatar}>
              <AppText variant="label" color={colors.ink}>
                {initials}
              </AppText>
            </PressableScale>
          </View>
        </View>

        <AppText variant="caption" color={colors.inkMuted} style={styles.kicker}>
          Net cash flow · {data.rangeLabel}
        </AppText>
        <View style={styles.heroRow}>
          <AppText variant="numeric" style={styles.heroAmount}>
            {formatMoney(data.net, currencySymbol)}
          </AppText>
          <View style={styles.delta}>
            <TrendUpGlyph color={colors.positive} size={9} />
            <AppText variant="label" color={colors.positive} style={styles.deltaText}>
              {`+${data.changePct}% ${data.compareLabel}`}
            </AppText>
          </View>
        </View>

        <AreaChart
          values={data.series}
          highlightIndex={data.highlightIndex}
          highlightLabel={highlightLabel}
        />

        <View style={styles.ranges}>
          {RANGES.map((item, index) => (
            <View
              key={item.id}
              style={index < RANGES.length - 1 ? styles.rangeSlot : undefined}>
              <TogglePill
                label={item.label}
                selected={range === item.id}
                onPress={() => setRange(item.id)}
              />
            </View>
          ))}
        </View>

        <View style={styles.split}>
          <View style={[styles.card, styles.splitCard, styles.splitLead]}>
            <AppText variant="caption" color={colors.inkMuted} style={styles.kicker}>
              In · {data.rangeLabel}
            </AppText>
            <AppText variant="heading" style={styles.splitAmount}>
              {formatMoney(data.income, currencySymbol, {decimals: 0})}
            </AppText>
            <ProgressBar progress={1} color={colors.positive} />
          </View>
          <View style={[styles.card, styles.splitCard]}>
            <AppText variant="caption" color={colors.inkMuted} style={styles.kicker}>
              Out · {data.rangeLabel}
            </AppText>
            <AppText variant="heading" style={styles.splitAmount}>
              {formatMoney(data.spent, currencySymbol, {decimals: 0})}
            </AppText>
            <ProgressBar
              progress={Math.min(1, data.spent / Math.max(data.income, 1))}
              color={colors.accent}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.breakdown}>
            <DonutChart slices={data.slices} size={128}>
              <AppText variant="caption" color={colors.inkMuted} style={styles.kicker}>
                Spent
              </AppText>
              <AppText variant="heading">
                {formatMoney(data.spent, currencySymbol, {decimals: 0})}
              </AppText>
            </DonutChart>
            <View style={styles.legend}>
              {data.slices.map(slice => (
                <View key={slice.id} style={styles.legendRow}>
                  <View
                    style={[styles.swatch, {backgroundColor: slice.color}]}
                  />
                  <AppText
                    variant="body"
                    color={colors.inkSecondary}
                    style={styles.legendLabel}
                    numberOfLines={1}>
                    {slice.label}
                  </AppText>
                  <AppText variant="bodyStrong">{slice.percent}%</AppText>
                </View>
              ))}
            </View>
          </View>
        </View>

        <View style={[styles.card, styles.health]}>
          <ScoreGauge score={data.health} />
          <View style={styles.healthCopy}>
            <AppText variant="caption" color={colors.inkMuted} style={styles.kicker}>
              Health score
            </AppText>
            <AppText variant="heading">Strong</AppText>
            <View style={styles.delta}>
              <TrendUpGlyph color={colors.positive} size={9} />
              <AppText variant="label" color={colors.positive} style={styles.deltaText}>
                {`${data.healthDelta} this month`}
              </AppText>
            </View>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

function initialsFrom(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return 'S';
  }
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.section,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.xxl,
  },
  headerCopy: {
    flex: 1,
    marginRight: spacing.md,
  },
  syncRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.positive,
    marginLeft: spacing.sm,
    marginRight: spacing.sm,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    backgroundColor: colors.danger,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  kicker: {
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
  },
  heroAmount: {
    marginRight: spacing.md,
    fontSize: 34,
    lineHeight: 40,
  },
  delta: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
  },
  deltaText: {
    marginLeft: spacing.sm,
  },
  ranges: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.xl,
    marginBottom: spacing.xl,
  },
  rangeSlot: {
    marginRight: spacing.sm,
  },
  split: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  splitLead: {
    marginRight: spacing.md,
  },
  splitCard: {
    flex: 1,
  },
  splitAmount: {
    marginTop: spacing.xs,
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
  breakdown: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legend: {
    flex: 1,
    marginLeft: spacing.lg,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  swatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
    marginRight: spacing.sm,
  },
  legendLabel: {
    flex: 1,
    marginRight: spacing.sm,
  },
  health: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 0,
  },
  healthCopy: {
    flex: 1,
    marginLeft: spacing.lg,
  },
});
