import React from 'react';

import {Stagger, TextField} from '../../../components/ui';
import {makeStyles, spacing} from '../../../theme';
import {STEP_TITLES, currencyByCode} from '../constants';
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
  const styles = useStyles();
  const copy = STEP_TITLES.money;
  const currency = currencyByCode(draft.currency);

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <TextField
          label="Starting balance"
          placeholder="0"
          prefix={currency.symbol}
          value={draft.startingBalance}
          onChangeText={value =>
            onChange('startingBalance', value.replace(/[^0-9]/g, ''))
          }
          keyboardType="number-pad"
          returnKeyType="done"
          helper="What is in your bank and wallet now. Paisa tracks from it; the money stays with you."
        />
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
          helper="Salary and other expected income. Logged income is added on top."
        />
      </Stagger>
    </StepLayout>
  );
}

const useStyles = makeStyles(() => ({
  spaced: {
    marginTop: spacing.xxl,
  },
}));
