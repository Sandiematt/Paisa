import React from 'react';
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AppText, BackButton, ProgressBar} from '../../components/ui';
import {formatMoney} from '../../lib/formatMoney';
import {colors, layout, radii, spacing} from '../../theme';
import {HomeRange, scaleMonthly} from './homeReport';

type SavingsDetailsScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  monthlySavingsGoal: number;
  periodSavingsTarget: number;
  actualSavings: number;
  savingsVsTarget: number;
  savingsUsesPlannedIncome: boolean;
  range: HomeRange;
};

function rangeWord(range: HomeRange): string {
  if (range === 'week') {
    return 'this week';
  }
  if (range === 'year') {
    return 'this year';
  }
  return 'this month';
}

export function SavingsDetailsScreen({
  visible,
  onClose,
  currencySymbol,
  monthlySavingsGoal,
  periodSavingsTarget,
  actualSavings,
  savingsVsTarget,
  savingsUsesPlannedIncome,
  range,
}: SavingsDetailsScreenProps) {
  const insets = useSafeAreaInsets();
  const target = periodSavingsTarget > 0 ? periodSavingsTarget : monthlySavingsGoal;
  const progress =
    target > 0 ? Math.max(0, Math.min(1, actualSavings / target)) : 0;
  const onTrack = savingsVsTarget >= 0;
  const remaining = target - actualSavings;
  const weeklyPace = scaleMonthly(monthlySavingsGoal, 'week', new Date());
  const yearlyPotential = scaleMonthly(monthlySavingsGoal, 'year', new Date());
  const periodLabel = rangeWord(range);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={[styles.root, {paddingTop: insets.top}]}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.topBar}>
          <BackButton onPress={onClose} />
          <AppText variant="heading" style={styles.screenTitle}>
            Savings Goal
          </AppText>
          <View style={styles.topBarSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {paddingBottom: Math.max(insets.bottom, spacing.section)},
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.card}>
            <AppText variant="caption" color={colors.inkMuted} style={styles.cardLabel}>
              {range === 'month'
                ? 'Monthly savings goal'
                : `Target ${periodLabel}`}
            </AppText>
            <AppText
              variant="numericHero"
              style={styles.heroAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {formatMoney(target, currencySymbol, {decimals: 0})}
            </AppText>

            <View style={styles.meterWrap}>
              <ProgressBar
                progress={progress}
                color={onTrack ? colors.positive : colors.danger}
              />
              <View style={styles.meterFooter}>
                <AppText variant="caption" color={colors.inkMuted}>
                  {Math.round(progress * 100)}% of {periodLabel}'s goal
                </AppText>
                <AppText
                  variant="caption"
                  color={onTrack ? colors.positive : colors.danger}>
                  {onTrack ? 'On track' : 'Off track'}
                </AppText>
              </View>
            </View>
            {range !== 'month' && periodSavingsTarget > 0 ? (
              <AppText variant="caption" color={colors.inkMuted} style={styles.derivedNote}>
                Target {periodLabel} is{' '}
                {formatMoney(periodSavingsTarget, currencySymbol, {decimals: 0})}{' '}
                from the monthly goal.
              </AppText>
            ) : null}
            {savingsUsesPlannedIncome ? (
              <AppText variant="caption" color={colors.inkMuted} style={styles.derivedNote}>
                Progress uses planned income minus spend until income is logged.
              </AppText>
            ) : null}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <View style={[styles.statDot, {backgroundColor: colors.accent}]} />
              <AppText variant="caption" color={colors.inkMuted} style={styles.statLabel}>
                Saved
              </AppText>
              <AppText
                variant="heading"
                color={colors.ink}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={styles.statAmount}>
                {formatMoney(Math.max(0, actualSavings), currencySymbol, {
                  decimals: 0,
                })}
              </AppText>
            </View>

            <View style={styles.statDivider} />

            <View style={styles.statCard}>
              <View
                style={[
                  styles.statDot,
                  {backgroundColor: remaining > 0 ? colors.inkMuted : colors.positive},
                ]}
              />
              <AppText variant="caption" color={colors.inkMuted} style={styles.statLabel}>
                {remaining > 0 ? 'To go' : 'Ahead'}
              </AppText>
              <AppText
                variant="heading"
                color={remaining > 0 ? colors.ink : colors.positive}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={styles.statAmount}>
                {formatMoney(Math.abs(remaining), currencySymbol, {decimals: 0})}
              </AppText>
            </View>
          </View>

          {monthlySavingsGoal > 0 ? (
            <View style={styles.card}>
              <AppText variant="heading" style={styles.sectionTitle}>
                From this monthly target
              </AppText>
              <View style={styles.derivedRow}>
                <AppText variant="body" color={colors.ink}>
                  Weekly pace
                </AppText>
                <AppText variant="bodyStrong" style={styles.derivedValue}>
                  {formatMoney(weeklyPace, currencySymbol, {decimals: 0})}
                </AppText>
              </View>
              <View style={[styles.derivedRow, styles.derivedRowLast]}>
                <AppText variant="body" color={colors.ink}>
                  Yearly potential
                </AppText>
                <AppText variant="bodyStrong" style={styles.derivedValue}>
                  {formatMoney(yearlyPotential, currencySymbol, {decimals: 0})}
                </AppText>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <AppText style={styles.emptyEmoji}>🎯</AppText>
              <AppText variant="heading" align="center" style={styles.emptyTitle}>
                No savings goal yet
              </AppText>
              <AppText variant="body" color={colors.inkMuted} align="center">
                Set a monthly savings goal in your profile. Weekly and yearly
                figures follow from that one number.
              </AppText>
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  screenTitle: {
    flex: 1,
    textAlign: 'center',
  },
  topBarSpacer: {
    width: 40,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
    marginBottom: spacing.lg,
  },
  cardLabel: {
    marginBottom: spacing.xs,
    includeFontPadding: false,
  },
  heroAmount: {
    fontSize: 44,
    lineHeight: 52,
    fontWeight: '700',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
    marginBottom: spacing.lg,
  },
  meterWrap: {
    gap: spacing.sm,
  },
  meterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  derivedNote: {
    marginTop: spacing.md,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  statCard: {
    flex: 1,
    padding: spacing.xl,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.hairline,
    alignSelf: 'stretch',
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
    marginBottom: spacing.sm,
  },
  statLabel: {
    marginBottom: spacing.xs,
    includeFontPadding: false,
  },
  statAmount: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  derivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
    gap: spacing.md,
  },
  derivedRowLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  derivedValue: {
    fontVariant: ['tabular-nums'],
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xxxl,
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  emptyTitle: {
    marginBottom: spacing.xs,
  },
});
