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
const SAVINGS_FRACTIONS = [0.1, 0.2, 0.3];

export function BudgetStep({draft, onChange}: BudgetStepProps) {
  const copy = STEP_TITLES.budget;
  const currency = currencyByCode(draft.currency);
  const income = Number(draft.monthlyIncome) || 0;

  const suggestions = useMemo(() => {
    if (income > 500) {
      const calculated = INCOME_FRACTIONS.map(fraction =>
        Math.round((income * fraction) / 500) * 500,
      );
      const unique = Array.from(new Set(calculated)).filter(amt => amt > 0);
      if (unique.length > 0) {
        return unique;
      }
    }
    return FLAT_SUGGESTIONS;
  }, [income]);

  const savingsSuggestions = useMemo(() => {
    if (income > 500) {
      const calculated = SAVINGS_FRACTIONS.map(fraction =>
        Math.round((income * fraction) / 500) * 500,
      );
      return Array.from(new Set(calculated)).filter(amt => amt > 0);
    }
    return [2000, 5000, 10000];
  }, [income]);

  const budget = Number(draft.monthlyBudget) || 0;
  const savingsGoal = Number(draft.monthlySavingsGoal) || 0;
  const leftover = income > 0 && budget > 0 ? income - budget : 0;
  const perDay = budget > 0 ? Math.round(budget / 30) : 0;

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <TextField
          label="Monthly spending budget"
          placeholder="0"
          prefix={currency.symbol}
          value={draft.monthlyBudget}
          onChangeText={value =>
            onChange('monthlyBudget', value.replace(/[^0-9]/g, ''))
          }
          keyboardType="number-pad"
          returnKeyType="done"
          helper="The most you plan to spend this month."
        />
      </Stagger>

      <Stagger index={2} style={styles.spaced}>
        <AppText variant="label" color={colors.inkSecondary}>
          {income > 500 ? 'Based on your income' : 'Common starting points'}
        </AppText>
        <View style={styles.pills}>
          {suggestions.map((amount, index) => (
            <TogglePill
              key={`suggestion-${amount}-${index}`}
              label={`${currency.symbol}${amount.toLocaleString('en-IN')}`}
              selected={draft.monthlyBudget === String(amount)}
              onPress={() => onChange('monthlyBudget', String(amount))}
            />
          ))}
        </View>
      </Stagger>

      <Stagger index={3} style={styles.spaced}>
        <TextField
          label="Monthly savings goal"
          placeholder="0"
          prefix={currency.symbol}
          value={draft.monthlySavingsGoal}
          onChangeText={value =>
            onChange('monthlySavingsGoal', value.replace(/[^0-9]/g, ''))
          }
          keyboardType="number-pad"
          returnKeyType="done"
          helper="How much you want left after spending."
        />
      </Stagger>

      <Stagger index={4} style={styles.spaced}>
        <View style={styles.pills}>
          {savingsSuggestions.map((amount, index) => (
            <TogglePill
              key={`save-${amount}-${index}`}
              label={`${currency.symbol}${amount.toLocaleString('en-IN')}`}
              selected={draft.monthlySavingsGoal === String(amount)}
              onPress={() => onChange('monthlySavingsGoal', String(amount))}
            />
          ))}
        </View>
      </Stagger>

      {perDay > 0 ? (
        <Stagger index={5} style={styles.spaced}>
          <View style={styles.readout}>
            <AppText variant="caption" color={colors.inkMuted}>
              That works out to
            </AppText>
            <AppText variant="numeric" style={styles.readoutValue}>
              {currency.symbol}
              {perDay.toLocaleString('en-IN')}
            </AppText>
            <AppText variant="body" color={colors.inkSecondary}>
              a day across 30 days.
            </AppText>
            {leftover !== 0 ? (
              <AppText
                variant="body"
                color={leftover < savingsGoal ? colors.danger : colors.inkSecondary}
                style={styles.leftover}>
                {leftover >= savingsGoal
                  ? `Income minus budget leaves ${currency.symbol}${leftover.toLocaleString('en-IN')} for savings.`
                  : `Income minus budget leaves ${currency.symbol}${leftover.toLocaleString('en-IN')}, below the savings goal.`}
              </AppText>
            ) : null}
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
  leftover: {
    marginTop: spacing.md,
  },
});
