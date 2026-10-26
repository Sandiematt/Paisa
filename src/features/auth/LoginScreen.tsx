import React, {useState} from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {Envelope, Eye, EyeSlash, Lock} from 'phosphor-react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {Logo} from '../../components/brand/Logo';
import {
  AppText,
  DividerLabel,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  Stagger,
} from '../../components/ui';
import {colors, layout, spacing} from '../../theme';
import {AuthField} from './components/AuthField';
import {ForgotPasswordModal} from './components/ForgotPasswordModal';
import {GoogleButton} from './components/GoogleButton';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type LoginScreenProps = {
  onSubmit: (email: string, password: string) => Promise<string | null>;
  onCreateAccount: () => void;
  onForgotPassword: (email: string) => Promise<string | null>;
  onVerifyResetCode: (email: string, code: string) => Promise<string | null>;
  onUpdatePassword: (newPassword: string) => Promise<string | null>;
  onCancelReset: () => void;
  onGoogle: () => void;
  onBack: () => void;
};

export function LoginScreen({
  onSubmit,
  onCreateAccount,
  onForgotPassword,
  onVerifyResetCode,
  onUpdatePassword,
  onCancelReset,
  onGoogle,
  onBack,
}: LoginScreenProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [resetOpen, setResetOpen] = useState(false);
  const handleSignIn = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    if (!password) {
      setError('Enter your password.');
      return;
    }

    setBusy(true);
    setError(undefined);
    const message = await onSubmit(email, password);
    setBusy(false);
    if (message) {
      setError(message);
    }
  };

  const openForgot = () => setResetOpen(true);

  const invalid = Boolean(error);

  return (
    <Screen glow={360}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader onBack={onBack} />

        <ScrollView
          style={styles.fill}
          contentContainerStyle={[
            styles.content,
            {paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.lg},
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <Stagger index={0} style={styles.hero}>
            <View pointerEvents="none" style={styles.mark}>
              <Logo size={96} trim />
            </View>
            <AppText
              variant="label"
              color={colors.lavender}
              style={styles.eyebrow}>
              Sign in to continue
            </AppText>
            <AppText variant="display" style={styles.headline}>
              Welcome to Paisa
            </AppText>
          </Stagger>

          <Stagger index={1} style={styles.fieldBlock}>
            <AuthField
              label="Email"
              icon={<Envelope color={colors.lavender} size={20} />}
              invalid={invalid}
              placeholder="you@domain.com"
              value={email}
              onChangeText={value => {
                setEmail(value);
                if (error) {
                  setError(undefined);
                }
              }}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              editable={!busy}
            />
          </Stagger>

          <Stagger index={2} style={styles.fieldBlock}>
            <View style={styles.passwordLabelRow}>
              <AppText
                variant="label"
                color={colors.muted}
                style={styles.passwordLabel}>
                Password
              </AppText>
              <PressableScale
                onPress={openForgot}
                scaleTo={0.96}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Forgot password">
                <AppText
                  variant="bodyStrong"
                  color={colors.lavender}
                  style={styles.forgot}>
                  Forgot?
                </AppText>
              </PressableScale>
            </View>
            <AuthField
              icon={<Lock color={colors.lavender} size={20} />}
              invalid={invalid}
              placeholder="Your password"
              value={password}
              onChangeText={value => {
                setPassword(value);
                if (error) {
                  setError(undefined);
                }
              }}
              secureTextEntry={!revealed}
              autoCapitalize="none"
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleSignIn}
              editable={!busy}
              trailing={
                <PressableScale
                  onPress={() => setRevealed(current => !current)}
                  scaleTo={0.94}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    revealed ? 'Hide password' : 'Show password'
                  }>
                  {revealed ? (
                    <EyeSlash color={colors.muted} size={20} />
                  ) : (
                    <Eye color={colors.muted} size={20} />
                  )}
                </PressableScale>
              }
            />
            {error ? (
              <AppText
                variant="label"
                color={colors.roseLight}
                style={styles.error}>
                {error}
              </AppText>
            ) : null}
          </Stagger>

          <Stagger index={3} style={styles.actions}>
            <PrimaryButton
              label={busy ? 'Signing in…' : 'Sign in'}
              onPress={handleSignIn}
              disabled={busy}
              loading={busy}
            />

            <DividerLabel label="or" />

            <GoogleButton
              label="Continue with Google"
              onPress={onGoogle}
              disabled={busy}
            />

            <View style={styles.signupRow}>
              <AppText variant="body" color={colors.muted}>
                New here?
              </AppText>
              <PressableScale
                onPress={onCreateAccount}
                scaleTo={0.96}
                hitSlop={6}
                accessibilityRole="button"
                style={styles.signupLink}>
                <AppText variant="bodyStrong" color={colors.lavender}>
                  Create an account
                </AppText>
              </PressableScale>
            </View>
          </Stagger>
        </ScrollView>
      </KeyboardAvoidingView>

      <ForgotPasswordModal
        visible={resetOpen}
        initialEmail={email}
        onSendCode={onForgotPassword}
        onVerifyCode={onVerifyResetCode}
        onUpdatePassword={onUpdatePassword}
        onCancel={() => {
          setResetOpen(false);
          onCancelReset();
        }}
        onFinished={resetEmail => {
          setResetOpen(false);
          setEmail(resetEmail);
          setPassword('');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xl,
  },
  hero: {
    marginBottom: spacing.xxxl,
  },
  mark: {
    alignSelf: 'flex-start',
    marginBottom: spacing.xxl,
  },
  eyebrow: {
    marginBottom: spacing.sm,
  },
  headline: {
    maxWidth: 300,
  },
  fieldBlock: {
    marginBottom: spacing.xl,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  passwordLabel: {
    marginLeft: 2,
  },
  forgot: {
    fontSize: 13,
    lineHeight: 18,
  },
  error: {
    marginTop: spacing.sm,
  },
  actions: {
    gap: spacing.lg,
    marginTop: spacing.xs,
  },
  signupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupLink: {
    paddingVertical: spacing.sm,
    paddingLeft: spacing.sm,
  },
});
