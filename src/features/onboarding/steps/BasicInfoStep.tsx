import React, {useState} from 'react';
import {View} from 'react-native';
import {CheckCircle} from 'phosphor-react-native/src/icons/CheckCircle';
import {Eye} from 'phosphor-react-native/src/icons/Eye';
import {EyeSlash} from 'phosphor-react-native/src/icons/EyeSlash';

import {AppText, PressableScale, Stagger, TextField} from '../../../components/ui';
import {PASSWORD_RULES} from '../../../lib/passwordRules';
import {colors, makeStyles, spacing, useTheme} from '../../../theme';
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
  useTheme();
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

/** Each rule a new password needs, ticked off as it is typed. */
function PasswordChecklist({password}: {password: string}) {
  const styles = useStyles();
  return (
    <View style={styles.rules} accessibilityLabel="Password rules">
      {PASSWORD_RULES.map(rule => {
        const met = rule.test(password);
        return (
          <View
            key={rule.id}
            style={styles.rule}
            accessible
            accessibilityLabel={`${rule.label}, ${met ? 'done' : 'not yet'}`}>
            {met ? (
              <CheckCircle size={16} color={colors.mint} weight="fill" />
            ) : (
              <View style={styles.ruleOpen} />
            )}
            <AppText
              variant="caption"
              color={met ? colors.text : colors.muted}
              style={styles.ruleText}>
              {rule.label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

export function BasicInfoStep({
  draft,
  errors,
  onChange,
  passwordless = false,
}: BasicInfoStepProps) {
  const styles = useStyles();
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
            placeholder="At least 8 characters"
            value={draft.password ?? ''}
            onChangeText={value => onChange('password', value)}
            secureTextEntry={!passwordShown}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="new-password"
            textContentType="newPassword"
            returnKeyType="next"
            error={errors.password}
            trailing={
              <RevealToggle
                revealed={passwordShown}
                onToggle={() => setPasswordShown(shown => !shown)}
                label="password"
              />
            }
          />
          <PasswordChecklist password={draft.password ?? ''} />
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

const useStyles = makeStyles(() => ({
  spaced: {
    marginTop: spacing.xxl,
  },
  tail: {
    height: spacing.lg,
  },
  rules: {
    gap: spacing.xs,
    marginTop: spacing.md,
    marginLeft: spacing.xs,
  },
  rule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  // Fills the row: Android re-measures a recoloured label too narrow and
  // clips it to its first word.
  ruleText: {
    flex: 1,
  },
  // Same footprint as the 16px check icon that replaces it.
  ruleOpen: {
    width: 13,
    height: 13,
    margin: 1.5,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: colors.muted,
  },
}));
