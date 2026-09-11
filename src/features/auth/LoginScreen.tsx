import React, {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  AppText,
  DividerLabel,
  GhostButton,
  PressableScale,
  PrimaryButton,
  Screen,
  ScreenHeader,
  Stagger,
  TextField,
} from '../../components/ui';
import {colors, layout, spacing} from '../../theme';
import {GoogleButton} from './components/GoogleButton';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type LoginScreenProps = {
  onSubmit: (email: string, password: string) => Promise<string | null>;
  onCreateAccount: () => void;
  onForgotPassword: (email: string) => Promise<string | null>;
  onGoogle: () => void;
  onBack: () => void;
};

export function LoginScreen({
  onSubmit,
  onCreateAccount,
  onForgotPassword,
  onGoogle,
  onBack,
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();

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

  const handleForgot = async () => {
    if (!EMAIL_PATTERN.test(email.trim())) {
      Alert.alert(
        'Email first',
        'Type the email on your account, then tap Forgot password.',
      );
      return;
    }
    setBusy(true);
    const message = await onForgotPassword(email);
    setBusy(false);
    if (message) {
      Alert.alert('Could not send reset', message);
      return;
    }
    Alert.alert(
      'Check your email',
      'If that address has an account, we sent a reset link.',
    );
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScreenHeader onBack={onBack} />

        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          <Stagger index={0}>
            <AppText variant="display">Welcome back.</AppText>
            <AppText
              variant="body"
              color={colors.inkSecondary}
              style={styles.subtitle}>
              Sign in to pick up where your last month left off.
            </AppText>
          </Stagger>

          <Stagger index={1} style={styles.field}>
            <TextField
              label="Email"
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

          <Stagger index={2} style={styles.field}>
            <TextField
              label="Password"
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
              error={error}
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
                  <AppText variant="label" color={colors.inkSecondary}>
                    {revealed ? 'Hide' : 'Show'}
                  </AppText>
                </PressableScale>
              }
            />
            <GhostButton
              label="Forgot password?"
              onPress={handleForgot}
              style={styles.forgot}
            />
          </Stagger>
        </ScrollView>

        <Stagger index={3} style={styles.footer}>
          <PrimaryButton
            label={busy ? 'Signing in…' : 'Sign in'}
            onPress={handleSignIn}
            disabled={busy}
          />

          <DividerLabel label="or" style={styles.divider} />

          <GoogleButton label="Continue with Google" onPress={onGoogle} />

          <View style={styles.newHere}>
            <AppText variant="body" color={colors.inkSecondary}>
              New here?
            </AppText>
            <GhostButton
              label="Create an account"
              tone="ink"
              onPress={onCreateAccount}
            />
          </View>
        </Stagger>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.xxl,
  },
  subtitle: {
    marginTop: spacing.md,
    maxWidth: 300,
  },
  field: {
    marginTop: spacing.xxl,
  },
  forgot: {
    alignSelf: 'flex-start',
    marginTop: spacing.xs,
    paddingHorizontal: 0,
  },
  footer: {
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
  },
  divider: {
    marginVertical: spacing.lg,
  },
  newHere: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
