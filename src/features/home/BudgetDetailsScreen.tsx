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
import {HomeRange, SpendSlice, rangePlanTitle} from '../home/homeReport';

type BudgetDetailsScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  budget: number;
  spent: number;
  remainingBudget: number;
  spendRatio: number;
  overBudget: boolean;
  slices: SpendSlice[];
  range?: HomeRange;
};

export function BudgetDetailsScreen({
  visible,
  onClose,
  currencySymbol,
  budget,
  spent,
  remainingBudget,
  spendRatio,
  overBudget,
  slices,
  range = 'month',
}: BudgetDetailsScreenProps) {
  const insets = useSafeAreaInsets();

  const progress =
    budget > 0 ? Math.max(0, Math.min(1, spent / budget)) : 0;

  const progressColor = overBudget ? colors.danger : colors.accent;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <View style={[styles.root, {paddingTop: insets.top}]}>
        <StatusBar barStyle="dark-content" />

        {/* Top bar */}
        <View style={styles.topBar}>
          <BackButton onPress={onClose} />
          <AppText variant="heading" style={styles.screenTitle}>
            Budget
          </AppText>
          {/* spacer to visually centre the title */}
          <View style={styles.topBarSpacer} />
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {paddingBottom: Math.max(insets.bottom, spacing.section)},
          ]}
          showsVerticalScrollIndicator={false}>

          {/* ── Total budget hero card ── */}
          <View style={styles.card}>
            <AppText variant="caption" color={colors.inkMuted} style={styles.cardLabel}>
              {rangePlanTitle(range, 'budget')}
            </AppText>
            <AppText
              variant="numericHero"
              style={styles.heroAmount}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.6}>
              {formatMoney(budget, currencySymbol, {decimals: 0})}
            </AppText>

            <View style={styles.meterWrap}>
              <ProgressBar progress={progress} color={progressColor} />
              <View style={styles.meterFooter}>
                <AppText variant="caption" color={colors.inkMuted}>
                  {overBudget ? 'Over budget' : `${Math.min(100, spendRatio)}% used`}
                </AppText>
                <AppText
                  variant="caption"
                  color={overBudget ? colors.danger : colors.inkMuted}>
                  {overBudget ? 'Over budget' : 'Within budget'}
                </AppText>
              </View>
            </View>
          </View>

          {/* ── Spent / Remaining stats row ── */}
          <View style={styles.statsRow}>
            {/* Spent */}
            <View style={styles.statCard}>
              <View style={[styles.statDot, {backgroundColor: colors.danger}]} />
              <AppText variant="caption" color={colors.inkMuted} style={styles.statLabel}>
                Spent
              </AppText>
              <AppText
                variant="heading"
                color={colors.ink}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={styles.statAmount}>
                {formatMoney(spent, currencySymbol, {decimals: 0})}
              </AppText>
            </View>

            <View style={styles.statDivider} />

            {/* Remaining */}
            <View style={styles.statCard}>
              <View
                style={[
                  styles.statDot,
                  {backgroundColor: overBudget ? colors.danger : colors.positive},
                ]}
              />
              <AppText variant="caption" color={colors.inkMuted} style={styles.statLabel}>
                {overBudget ? 'Over by' : 'Remaining'}
              </AppText>
              <AppText
                variant="heading"
                color={overBudget ? colors.danger : colors.positive}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
                style={styles.statAmount}>
                {formatMoney(Math.abs(remainingBudget), currencySymbol, {decimals: 0})}
              </AppText>
            </View>
          </View>

          {/* ── Category breakdown ── */}
          {slices.length > 0 ? (
            <View style={styles.card}>
              <AppText variant="heading" style={styles.sectionTitle}>
                By Category
              </AppText>

              {slices.map((slice, idx) => {
                // Derive amount from the percentage share of total spent
                const sliceAmount = (slice.percent / 100) * spent;

                return (
                  <View
                    key={slice.id}
                    style={[
                      styles.categoryRow,
                      idx < slices.length - 1 && styles.categoryRowBorder,
                    ]}>
                    <View style={styles.categoryLeft}>
                      <View
                        style={[styles.categoryDot, {backgroundColor: slice.color}]}
                      />
                      <AppText
                        variant="body"
                        color={colors.ink}
                        numberOfLines={1}
                        style={styles.categoryName}>
                        {slice.label}
                      </AppText>
                    </View>

                    <View style={styles.categoryRight}>
                      <AppText
                        variant="bodyStrong"
                        color={colors.ink}
                        style={styles.categoryAmount}>
                        {formatMoney(sliceAmount, currencySymbol, {decimals: 0})}
                      </AppText>
                      <View style={styles.pctBadge}>
                        <AppText variant="caption" color={colors.inkMuted}>
                          {slice.percent}%
                        </AppText>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : (
            /* ── Empty state ── */
            <View style={styles.emptyCard}>
              <AppText style={styles.emptyEmoji}>💰</AppText>
              <AppText variant="heading" align="center" style={styles.emptyTitle}>
                No spending yet
              </AppText>
              <AppText variant="body" color={colors.inkMuted} align="center">
                Add transactions and they'll appear here, broken down by category.
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

  // Hero budget card
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

  // Stats row
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

  // Category breakdown
  sectionTitle: {
    marginBottom: spacing.lg,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.md,
  },
  categoryRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  categoryLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  categoryDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
    flexShrink: 0,
  },
  categoryName: {
    flex: 1,
    includeFontPadding: false,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 0,
  },
  categoryAmount: {
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  pctBadge: {
    backgroundColor: colors.canvasSunk,
    borderRadius: radii.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    minWidth: 40,
    alignItems: 'center',
  },

  // Empty state
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
