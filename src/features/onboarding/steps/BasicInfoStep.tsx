import React from 'react';
import {StyleSheet, View} from 'react-native';

import {Stagger, TextField} from '../../../components/ui';
import {spacing} from '../../../theme';
import {STEP_TITLES} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {OnboardingDraft} from '../types';

type BasicInfoStepProps = {
  draft: OnboardingDraft;
  errors: Partial<Record<keyof OnboardingDraft, string>>;
  onChange: <K extends keyof OnboardingDraft>(
    key: K,
    value: OnboardingDraft[K],
  ) => void;
};

export function BasicInfoStep({draft, errors, onChange}: BasicInfoStepProps) {
  const copy = STEP_TITLES.basics;

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <TextField
          label="Your name"
          placeholder="Ananya Raghunathan"
          value={draft.name}
          onChangeText={value => onChange('name', value)}
          autoCapitalize="words"
          autoComplete="name"
          textContentType="name"
          returnKeyType="next"
          error={errors.name}
        />
      </Stagger>

      <Stagger index={2} style={styles.spaced}>
        <TextField
          label="Email"
          placeholder="you@domain.com"
          value={draft.email}
          onChangeText={value => onChange('email', value)}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="done"
          helper="Used for sign-in and monthly summaries."
          error={errors.email}
        />
      </Stagger>

      <Stagger index={3} style={styles.spaced}>
        <TextField
          label="Password"
          placeholder="At least 6 characters"
          value={draft.password ?? ''}
          onChangeText={value => onChange('password', value)}
          secureTextEntry
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          returnKeyType="done"
          helper="This is how you will sign back in."
          error={errors.password}
        />
      </Stagger>

      <View style={styles.tail} />
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: spacing.xxl,
  },
  tail: {
    height: spacing.lg,
  },
});
