import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText, Stagger, TextField, TogglePill} from '../../../components/ui';
import {colors, spacing} from '../../../theme';
import {CURRENCIES, STEP_TITLES, currencyByCode} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type CurrencyIncomeStepProps = {
  draft: OnboardingDraft;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
};

export function CurrencyIncomeStep({draft, onChange}: CurrencyIncomeStepProps) {
  const copy = STEP_TITLES.money;
  const currency = currencyByCode(draft.currency);

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <AppText variant="label" color={colors.inkSecondary}>
          Currency
        </AppText>
        <View style={styles.pills}>
          {CURRENCIES.map(item => (
            <TogglePill
              key={item.code}
              label={`${item.symbol}  ${item.code}`}
              selected={draft.currency === item.code}
              onPress={() => onChange('currency', item.code)}
            />
          ))}
        </View>
      </Stagger>

      <Stagger index={2} style={styles.spaced}>
        <TextField
          label="Monthly income"
          placeholder="0"
          prefix={currency.symbol}
          value={draft.monthlyIncome}
          onChangeText={value =>
            onChange('monthlyIncome', value.replace(/[^0-9]/g, ''))
          }
          keyboardType="number-pad"
          returnKeyType="done"
          helper="Optional. It only sets the scale of your charts."
        />
      </Stagger>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  spaced: {
    marginTop: spacing.xxl,
  },
});
