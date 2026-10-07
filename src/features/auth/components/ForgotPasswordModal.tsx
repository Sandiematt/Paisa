import React, {useEffect, useState} from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import {AppText, PressableScale} from '../../../components/ui';
import {
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
} from '../../../components/icons/FeatherIcons';
import {colors, fonts, radii, spacing} from '../../../theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CODE_PATTERN = /^\d{6,8}$/;
const MIN_PASSWORD = 8;

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
    body: () => `Code verified. Choose a password with at least ${MIN_PASSWORD} characters.`,
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
    if (newPassword.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
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
  const rowStyle = [styles.inputRow, error ? styles.inputError : null];

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
          <AppText variant="heading" style={styles.title}>
            {COPY[step].title}
          </AppText>
          <AppText style={styles.body}>{COPY[step].body(email.trim())}</AppText>

          {step === 'email' ? (
            <View style={rowStyle}>
              <View style={styles.fieldIcon}>
                <MailIcon color={colors.gold} size={20} />
              </View>
              <TextInput
                style={styles.input}
                placeholder="you@domain.com"
                placeholderTextColor={colors.inkMuted}
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
                underlineColorAndroid="transparent"
                editable={!busy}
              />
            </View>
          ) : null}

          {step === 'code' ? (
            <>
              <View style={rowStyle}>
                <TextInput
                  style={[styles.input, styles.codeInput]}
                  placeholder="••••••"
                  placeholderTextColor={colors.inkMuted}
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
                  underlineColorAndroid="transparent"
                  editable={!busy}
                  autoFocus
                />
              </View>
              <PressableScale
                onPress={sendCode}
                disabled={busy}
                scaleTo={0.96}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.linkButton}>
                <AppText style={styles.link}>Resend code</AppText>
              </PressableScale>
            </>
          ) : null}

          {step === 'password' ? (
            <>
              <View style={rowStyle}>
                <View style={styles.fieldIcon}>
                  <LockIcon color={colors.gold} size={18} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="New password"
                  placeholderTextColor={colors.inkMuted}
                  value={newPassword}
                  onChangeText={value => {
                    setNewPassword(value);
                    clearError();
                  }}
                  secureTextEntry={!revealed}
                  autoCapitalize="none"
                  textContentType="newPassword"
                  returnKeyType="next"
                  underlineColorAndroid="transparent"
                  editable={!busy}
                  autoFocus
                />
                <PressableScale
                  onPress={() => setRevealed(current => !current)}
                  scaleTo={0.94}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={revealed ? 'Hide password' : 'Show password'}>
                  {revealed ? (
                    <EyeOffIcon color={colors.inkMuted} size={18} />
                  ) : (
                    <EyeIcon color={colors.inkMuted} size={18} />
                  )}
                </PressableScale>
              </View>
              <View style={rowStyle}>
                <View style={styles.fieldIcon}>
                  <LockIcon color={colors.gold} size={18} />
                </View>
                <TextInput
                  style={styles.input}
                  placeholder="Confirm new password"
                  placeholderTextColor={colors.inkMuted}
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
                  underlineColorAndroid="transparent"
                  editable={!busy}
                />
              </View>
            </>
          ) : null}

          {error ? <AppText style={styles.error}>{error}</AppText> : null}

          <PressableScale
            onPress={action.onPress}
            disabled={busy}
            scaleTo={0.975}
            accessibilityRole="button"
            accessibilityState={{disabled: busy}}
            style={[styles.primary, busy ? styles.primaryBusy : null]}>
            <AppText variant="heading" style={styles.primaryLabel}>
              {busy ? action.busyLabel : action.label}
            </AppText>
          </PressableScale>

          {step !== 'done' ? (
            <PressableScale
              onPress={onCancel}
              disabled={busy}
              scaleTo={0.96}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.linkButton}>
              <AppText style={styles.cancel}>Cancel</AppText>
            </PressableScale>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    backgroundColor: 'rgba(34, 32, 27, 0.55)',
  },
  card: {
    backgroundColor: colors.sheet,
    borderRadius: 24,
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    color: colors.ink,
  },
  body: {
    fontFamily: fonts.interMedium,
    fontSize: 14,
    lineHeight: 20,
    color: colors.inkSoft,
  },
  inputRow: {
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.field,
    borderRadius: radii.input,
    borderWidth: 1.5,
    borderColor: colors.fieldStroke,
  },
  inputError: {
    borderColor: colors.danger,
  },
  fieldIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    fontFamily: fonts.interMedium,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  codeInput: {
    fontFamily: fonts.interSemi,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: {
    fontFamily: fonts.interMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  primary: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBusy: {
    opacity: 0.72,
  },
  primaryLabel: {
    fontSize: 16,
    lineHeight: 21,
    color: colors.sheet,
  },
  linkButton: {
    alignSelf: 'center',
  },
  link: {
    fontFamily: fonts.interSemi,
    fontSize: 13,
    lineHeight: 18,
    color: colors.gold,
  },
  cancel: {
    fontFamily: fonts.interSemi,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
});
