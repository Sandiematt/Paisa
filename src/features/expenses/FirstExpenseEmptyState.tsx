import React from 'react';
import {View} from 'react-native';

import {
  AppText,
  CelebrationBadge,
  Card,
  PrimaryButton,
  Screen,
  Stagger,
} from '../../components/ui';
import {colors, layout, makeStyles, palettes, radii, spacing} from '../../theme';
import {CategoryIconSquare} from '../add/categoryIcons';
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
  const styles = useStyles();
  const currency = currencyByCode(draft.currency);
  const firstName = draft.name.trim().split(' ')[0] || 'there';
  const previewCategories = draft.categoryIds.slice(0, 4);

  return (
    <Screen glow edges={inTabs ? ['top'] : ['top', 'bottom']}>
      <View style={[styles.root, inTabs && styles.rootInTabs]}>
        <View style={styles.center}>
          <Stagger index={0}>
            <CelebrationBadge />
          </Stagger>

          <Stagger index={1} style={styles.copy}>
            <AppText variant="display">You are set, {firstName}.</AppText>
            <AppText
              variant="body"
              color={colors.muted}
              style={styles.subtitle}>
              Nothing to report yet. Log one expense and your monthly breakdown
              starts filling in.
            </AppText>
          </Stagger>

          <Stagger index={2} style={styles.preview}>
            <Card radius={radii.cardHero} padding={spacing.xl}>
              <AppText variant="caption" color={colors.muted}>
                Spent this month
              </AppText>
              <AppText variant="numericHero" style={styles.amount}>
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
                      <CategoryIconSquare id={id} size={28} />
                      <AppText
                        variant="body"
                        color={colors.text}
                        style={styles.legendLabel}>
                        {category.label}
                      </AppText>
                      <View style={styles.bar} />
                    </View>
                  );
                })}
              </View>
            </Card>
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

const useStyles = makeStyles(palette => ({
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
  legendLabel: {
    marginLeft: spacing.md,
    width: 108,
  },
  // Flat rails stand in for the bars that will appear once data lands.
  bar: {
    flex: 1,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: palette === palettes.light ? colors.canvasSunk : colors.line,
  },
}));
