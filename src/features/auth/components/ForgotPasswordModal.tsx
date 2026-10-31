import React, {useEffect, useState} from 'react';
import {KeyboardAvoidingView, Modal, Platform, View} from 'react-native';
import {Envelope} from 'phosphor-react-native/src/icons/Envelope';
import {Eye} from 'phosphor-react-native/src/icons/Eye';
import {EyeSlash} from 'phosphor-react-native/src/icons/EyeSlash';
import {Lock} from 'phosphor-react-native/src/icons/Lock';

import {
  AppText,
  GhostButton,
  PressableScale,
  PrimaryButton,
} from '../../../components/ui';
import {colors, makeStyles, radii, spacing} from '../../../theme';
import {AuthField} from './AuthField';
import {firstMissedRule} from '../../../lib/passwordRules';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_PATTERN = /^\d{6,8}$/;

type Step = 'email' | 'code' | 'password' | 'done';

type ForgotPasswordModalProps = {
  visible: boolean;
  initialEmail: string;
  onSendCode: (email: string) => Promise<string | null>;
  onVerifyCode: (email: string, code: string) => Promise<string | null>;
  onUpdatePassword: (newPassword: string) => Promise<string | null>;
  onCancel: () => void;
  onFinished: (email: string) => void;
};

const COPY: Record<Step, {title: string; body: (email: string) => string}> = {
  email: {
    title: 'Reset password',
    body: () => "Enter your account email and we'll send you a one-time code.",
  },
  code: {
    title: 'Enter the code',
    body: email => `We sent a code to ${email}. Enter it to continue.`,
  },
  password: {
    title: 'Set a new password',
    body: () =>
      'Code verified. Use at least 8 characters with a capital letter, a small letter, a number and a symbol.',
  },
  done: {
    title: 'Password updated',
    body: () => 'Sign in with your new password.',
  },
};

export function ForgotPasswordModal({
  visible,
  initialEmail,
  onSendCode,
  onVerifyCode,
  onUpdatePassword,
  onCancel,
  onFinished,
}: ForgotPasswordModalProps) {
  const styles = useStyles();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    if (visible) {
      setStep('email');
      setEmail(initialEmail);
      setCode('');
      setNewPassword('');
      setConfirmPassword('');
      setRevealed(false);
      setError(undefined);
    }
  }, [visible, initialEmail]);

  const run = async (task: () => Promise<string | null>, next: Step) => {
    setBusy(true);
    setError(undefined);
    const message = await task();
    setBusy(false);
    if (message) {
      setError(message);
      return;
    }
    setStep(next);
  };

  const sendCode = () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setCode('');
    run(() => onSendCode(email.trim()), 'code');
  };

  const verifyCode = () => {
    if (!CODE_PATTERN.test(code)) {
      setError('Enter the code from your email.');
      return;
    }
    run(() => onVerifyCode(email.trim(), code), 'password');
  };

  const savePassword = () => {
    const missed = firstMissedRule(newPassword);
    if (missed) {
      setError(`Password needs: ${missed.label.toLowerCase()}.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    run(() => onUpdatePassword(newPassword), 'done');
  };

  const clearError = () => {
    if (error) {
      setError(undefined);
    }
  };

  const primary: Record<Step, {label: string; busyLabel: string; onPress: () => void}> = {
    email: {label: 'Send code', busyLabel: 'Sending…', onPress: sendCode},
    code: {label: 'Verify code', busyLabel: 'Verifying…', onPress: verifyCode},
    password: {label: 'Update password', busyLabel: 'Updating…', onPress: savePassword},
    done: {label: 'Done', busyLabel: 'Done', onPress: () => onFinished(email.trim())},
  };
  const action = primary[step];
  const invalid = Boolean(error);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={step === 'done' ? () => onFinished(email.trim()) : onCancel}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <AppText variant="title" style={styles.title}>
            {COPY[step].title}
          </AppText>
          <AppText variant="body" color={colors.muted}>
            {COPY[step].body(email.trim())}
          </AppText>

          {step === 'email' ? (
            <AuthField
              inset
              invalid={invalid}
              icon={<Envelope color={colors.lavender} size={20} />}
              placeholder="you@domain.com"
              value={email}
              onChangeText={value => {
                setEmail(value);
                clearError();
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              returnKeyType="send"
              onSubmitEditing={sendCode}
              editable={!busy}
            />
          ) : null}

          {step === 'code' ? (
            <>
              <AuthField
                inset
                code
                invalid={invalid}
                placeholder="••••••"
                value={code}
                onChangeText={value => {
                  setCode(value.replace(/\D/g, '').slice(0, 8));
                  clearError();
                }}
                keyboardType="number-pad"
                maxLength={8}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                returnKeyType="done"
                onSubmitEditing={verifyCode}
                editable={!busy}
                autoFocus
              />
              <PressableScale
                onPress={sendCode}
                disabled={busy}
                scaleTo={0.96}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.linkButton}>
                <AppText variant="bodyStrong" color={colors.lavender}>
                  Resend code
                </AppText>
              </PressableScale>
            </>
          ) : null}

          {step === 'password' ? (
            <>
              <AuthField
                inset
                invalid={invalid}
                icon={<Lock color={colors.lavender} size={20} />}
                placeholder="New password"
                value={newPassword}
                onChangeText={value => {
                  setNewPassword(value);
                  clearError();
                }}
                secureTextEntry={!revealed}
                autoCapitalize="none"
                textContentType="newPassword"
                returnKeyType="next"
                editable={!busy}
                autoFocus
                trailing={
                  <PressableScale
                    onPress={() => setRevealed(current => !current)}
                    scaleTo={0.94}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={revealed ? 'Hide password' : 'Show password'}>
                    {revealed ? (
                      <EyeSlash color={colors.muted} size={20} />
                    ) : (
                      <Eye color={colors.muted} size={20} />
                    )}
                  </PressableScale>
                }
              />
              <AuthField
                inset
                invalid={invalid}
                icon={<Lock color={colors.lavender} size={20} />}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChangeText={value => {
                  setConfirmPassword(value);
                  clearError();
                }}
                secureTextEntry={!revealed}
                autoCapitalize="none"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={savePassword}
                editable={!busy}
              />
            </>
          ) : null}

          {error ? (
            <AppText variant="label" color={colors.roseLight}>
              {error}
            </AppText>
          ) : null}

          <PrimaryButton
            label={busy ? action.busyLabel : action.label}
            onPress={action.onPress}
            disabled={busy}
            loading={busy}
          />

          {step !== 'done' ? (
            <GhostButton
              label="Cancel"
              onPress={busy ? () => undefined : onCancel}
              style={styles.linkButton}
            />
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles(() => ({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.scrim,
  },
  card: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radii.sheet,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    letterSpacing: -0.3,
  },
  linkButton: {
    alignSelf: 'center',
  },
}));
