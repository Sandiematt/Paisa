import React, {useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {Eye, EyeSlash} from 'phosphor-react-native';

import {PressableScale, Stagger, TextField} from '../../../components/ui';
import {colors, spacing} from '../../../theme';
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
  passwordless?: boolean;
};

function RevealToggle({
  revealed,
  onToggle,
  label,
}: {
  revealed: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <PressableScale
      onPress={onToggle}
      scaleTo={0.94}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`${revealed ? 'Hide' : 'Show'} ${label}`}>
      {revealed ? (
        <EyeSlash color={colors.muted} size={20} />
      ) : (
        <Eye color={colors.muted} size={20} />
      )}
    </PressableScale>
  );
}

export function BasicInfoStep({
  draft,
  errors,
  onChange,
  passwordless = false,
}: BasicInfoStepProps) {
  const copy = STEP_TITLES.basics;
  const [passwordShown, setPasswordShown] = useState(false);
  const [confirmShown, setConfirmShown] = useState(false);

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
          editable={!passwordless}
          helper={
            passwordless
              ? 'From your Google account.'
              : 'Used for sign-in and monthly summaries.'
          }
          error={errors.email}
        />
      </Stagger>

      {passwordless ? null : (
        <Stagger index={3} style={styles.spaced}>
          <TextField
            label="Password"
            placeholder="At least 6 characters"
            value={draft.password ?? ''}
            onChangeText={value => onChange('password', value)}
            secureTextEntry={!passwordShown}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            helper="This is how you will sign back in."
            error={errors.password}
            trailing={
              <RevealToggle
                revealed={passwordShown}
                onToggle={() => setPasswordShown(shown => !shown)}
                label="password"
              />
            }
          />
        </Stagger>
      )}

      {passwordless ? null : (
        <Stagger index={4} style={styles.spaced}>
          <TextField
            label="Confirm password"
            placeholder="Type it again"
            value={draft.confirmPassword ?? ''}
            onChangeText={value => onChange('confirmPassword', value)}
            secureTextEntry={!confirmShown}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="done"
            error={errors.confirmPassword}
            trailing={
              <RevealToggle
                revealed={confirmShown}
                onToggle={() => setConfirmShown(shown => !shown)}
                label="confirm password"
              />
            }
          />
        </Stagger>
      )}

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
