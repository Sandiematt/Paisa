import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText, Stagger, TextField, TogglePill} from '../../../components/ui';
import {colors, radii, spacing} from '../../../theme';
import {STEP_TITLES, currencyByCode} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type BudgetStepProps = {
  draft: OnboardingDraft;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
};

/** Fractions of stated income, so the suggestions mean something. */
const INCOME_FRACTIONS = [0.5, 0.6, 0.7];
const FLAT_SUGGESTIONS = [20000, 40000, 60000];

export function BudgetStep({draft, onChange}: BudgetStepProps) {
  const copy = STEP_TITLES.budget;
  const currency = currencyByCode(draft.currency);
  const income = Number(draft.monthlyIncome) || 0;

  const suggestions = useMemo(() => {
    if (income > 0) {
      return INCOME_FRACTIONS.map(fraction =>
        Math.round((income * fraction) / 500) * 500,
      );
    }
    return FLAT_SUGGESTIONS;
  }, [income]);

  const budget = Number(draft.monthlyBudget) || 0;
  const perDay = budget > 0 ? Math.round(budget / 30) : 0;

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <TextField
          label="Monthly budget"
          placeholder="0"
          prefix={currency.symbol}
          value={draft.monthlyBudget}
          onChangeText={value =>
            onChange('monthlyBudget', value.replace(/[^0-9]/g, ''))
          }
          keyboardType="number-pad"
          returnKeyType="done"
        />
      </Stagger>

      <Stagger index={2} style={styles.spaced}>
        <AppText variant="label" color={colors.inkSecondary}>
          {income > 0 ? 'Based on your income' : 'Common starting points'}
        </AppText>
        <View style={styles.pills}>
          {suggestions.map(amount => (
            <TogglePill
              key={amount}
              label={`${currency.symbol}${amount.toLocaleString('en-IN')}`}
              selected={draft.monthlyBudget === String(amount)}
              onPress={() => onChange('monthlyBudget', String(amount))}
            />
          ))}
        </View>
      </Stagger>

      {perDay > 0 ? (
        <Stagger index={3} style={styles.spaced}>
          <View style={styles.readout}>
            <AppText variant="caption" color={colors.inkMuted}>
              That works out to
            </AppText>
            <AppText variant="numeric" style={styles.readoutValue}>
              {currency.symbol}
              {perDay.toLocaleString('en-IN')}
            </AppText>
            <AppText variant="body" color={colors.inkSecondary}>
              a day, across 30 days.
            </AppText>
          </View>
        </Stagger>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: spacing.xxl,
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  readout: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.xl,
  },
  readoutValue: {
    marginTop: spacing.xs,
    marginBottom: 2,
  },
});
