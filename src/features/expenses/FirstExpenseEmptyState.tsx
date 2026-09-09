import React from 'react';
import {StyleSheet, View} from 'react-native';

import {
  AppText,
  CelebrationBadge,
  PrimaryButton,
  Screen,
  Stagger,
} from '../../components/ui';
import {colors, layout, radii, spacing} from '../../theme';
import {categoryById, currencyByCode} from '../onboarding/constants';
import {OnboardingDraft} from '../onboarding/types';

type FirstExpenseEmptyStateProps = {
  draft: OnboardingDraft;
  onAddExpense: () => void;
  /** Drop the bottom safe-area inset when the tab bar owns it. */
  inTabs?: boolean;
};

/**
 * Landing surface straight out of setup. The preview card is the empty state
 * doing real work: it shows the exact shape the report will take once there is
 * data, using the categories the user just picked.
 */
export function FirstExpenseEmptyState({
  draft,
  onAddExpense,
  inTabs = false,
}: FirstExpenseEmptyStateProps) {
  const currency = currencyByCode(draft.currency);
  const firstName = draft.name.trim().split(' ')[0] || 'there';
  const previewCategories = draft.categoryIds.slice(0, 4);

  return (
    <Screen edges={inTabs ? ['top'] : ['top', 'bottom']}>
      <View style={[styles.root, inTabs && styles.rootInTabs]}>
        <View style={styles.center}>
          <Stagger index={0}>
            <CelebrationBadge />
          </Stagger>

          <Stagger index={1} style={styles.copy}>
            <AppText variant="display">You are set, {firstName}.</AppText>
            <AppText
              variant="body"
              color={colors.inkSecondary}
              style={styles.subtitle}>
              Nothing to report yet. Log one expense and your monthly breakdown
              starts filling in.
            </AppText>
          </Stagger>

          <Stagger index={2} style={styles.preview}>
            <View style={styles.card}>
              <AppText variant="caption" color={colors.inkMuted}>
                Spent this month
              </AppText>
              <AppText variant="numeric" style={styles.amount}>
                {currency.symbol}0
              </AppText>

              <View style={styles.legend}>
                {previewCategories.map(id => {
                  const category = categoryById(id);
                  if (!category) {
                    return null;
                  }
                  return (
                    <View key={id} style={styles.legendRow}>
                      <View
                        style={[styles.dot, {backgroundColor: category.color}]}
                      />
                      <AppText
                        variant="body"
                        color={colors.inkSecondary}
                        style={styles.legendLabel}>
                        {category.label}
                      </AppText>
                      <View style={styles.bar} />
                    </View>
                  );
                })}
              </View>
            </View>
          </Stagger>
        </View>

        <Stagger index={3}>
          <PrimaryButton
            label="Add your first expense"
            onPress={onAddExpense}
            accessibilityHint="Opens the new expense form"
          />
        </Stagger>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
  },
  rootInTabs: {
    paddingBottom: spacing.lg,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
  },
  copy: {
    marginTop: spacing.xxl,
  },
  subtitle: {
    marginTop: spacing.md,
    maxWidth: 320,
  },
  preview: {
    marginTop: spacing.xxxl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
  },
  amount: {
    marginTop: spacing.xs,
  },
  legend: {
    marginTop: spacing.xl,
    gap: spacing.md,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 9,
    height: 9,
    borderRadius: radii.pill,
    opacity: 0.45,
  },
  legendLabel: {
    marginLeft: spacing.sm,
    width: 108,
  },
  // Flat rails stand in for the bars that will appear once data lands.
  bar: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.canvasSunk,
  },
});
