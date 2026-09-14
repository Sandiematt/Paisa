import React, {useState} from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import {BlurView} from '@react-native-community/blur';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {Logo} from '../../components/brand/Logo';
import {AppText, PressableScale, Stagger} from '../../components/ui';
import {
  ChevronLeftIcon,
  EyeIcon,
  EyeOffIcon,
  LockIcon,
  MailIcon,
} from '../../components/icons/FeatherIcons';
import {colors, fonts, radii, spacing} from '../../theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const HERO_BODY = 306;

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
  const insets = useSafeAreaInsets();
  const {width: screenWidth} = useWindowDimensions();
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
        'Type the email on your account, then tap Forgot.',
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

  const heroHeight = HERO_BODY + insets.top;
  const photoHeight = heroHeight + 32;

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" />
      <Image
        source={require('../../../assets/auth/login-hero.jpg')}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: screenWidth,
          height: photoHeight,
        }}
        resizeMode="cover"
        accessibilityIgnoresInvertColors
      />
      <View
        pointerEvents="none"
        style={[
          styles.overlay,
          {width: screenWidth, height: photoHeight},
        ]}
      />
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.hero, {height: heroHeight}]}>
          <View style={[styles.heroContent, {paddingTop: insets.top}]}>
            <PressableScale
              onPress={onBack}
              scaleTo={0.92}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              containerStyle={styles.backHit}
              style={styles.backShadow}>
              <View style={styles.backClip}>
                <BlurView
                  pointerEvents="none"
                  style={StyleSheet.absoluteFill}
                  blurType="light"
                  blurAmount={12}
                  {...(Platform.OS === 'android'
                    ? {blurRadius: 12, overlayColor: 'transparent'}
                    : {reducedTransparencyFallbackColor: '#ffffffcc'})}
                />
                <View pointerEvents="none" style={styles.backTint} />
                <ChevronLeftIcon color={colors.ink} size={20} />
              </View>
            </PressableScale>

            <View pointerEvents="none" style={styles.markSlot}>
              <Logo size={120} />
            </View>

            <View style={styles.headlineBlock}>
              <AppText variant="caption" style={styles.eyebrow}>
                SIGN IN TO CONTINUE
              </AppText>
              <AppText variant="display" color="#FFFFFF" style={styles.headline}>
                Welcome to Paisa
              </AppText>
            </View>
          </View>
        </View>

        <View style={styles.sheet}>
          <ScrollView
            style={styles.fill}
            contentContainerStyle={[
              styles.sheetContent,
              {paddingBottom: Math.max(insets.bottom, spacing.lg)},
            ]}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            showsVerticalScrollIndicator={false}>
            <Stagger index={0} style={styles.fieldBlock}>
              <AppText style={styles.fieldLabel}>EMAIL</AppText>
              <View style={[styles.inputRow, error ? styles.inputError : null]}>
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
                  underlineColorAndroid="transparent"
                  editable={!busy}
                />
              </View>
            </Stagger>

            <Stagger index={1} style={styles.fieldBlock}>
              <View style={styles.passwordLabelRow}>
                <AppText style={styles.fieldLabel}>PASSWORD</AppText>
                <PressableScale
                  onPress={handleForgot}
                  scaleTo={0.96}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Forgot password">
                  <AppText style={styles.forgot}>Forgot?</AppText>
                </PressableScale>
              </View>
              <View style={[styles.inputRow, error ? styles.inputError : null]}>
                <View style={styles.fieldIcon}>
                  <LockIcon color={colors.gold} size={18} />
                </View>
                <TextInput
                  style={[styles.input, styles.passwordInput]}
                  placeholder="Your password"
                  placeholderTextColor={colors.inkMuted}
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
                  underlineColorAndroid="transparent"
                  editable={!busy}
                />
                <PressableScale
                  onPress={() => setRevealed(current => !current)}
                  scaleTo={0.94}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={
                    revealed ? 'Hide password' : 'Show password'
                  }>
                  {revealed ? (
                    <EyeOffIcon color={colors.inkMuted} size={18} />
                  ) : (
                    <EyeIcon color={colors.inkMuted} size={18} />
                  )}
                </PressableScale>
              </View>
              {error ? (
                <AppText style={styles.error}>{error}</AppText>
              ) : null}
            </Stagger>

            <Stagger index={2} style={styles.actions}>
              <PressableScale
                onPress={handleSignIn}
                disabled={busy}
                scaleTo={0.975}
                accessibilityRole="button"
                accessibilityState={{disabled: busy}}
                containerStyle={styles.signInWrap}
                style={[styles.signIn, busy ? styles.signInBusy : null]}>
                <AppText variant="heading" style={styles.signInLabel}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </AppText>
              </PressableScale>

              <PressableScale
                onPress={onGoogle}
                disabled={busy}
                scaleTo={0.975}
                accessibilityRole="button"
                accessibilityHint="Google sign-in is not connected yet"
                style={styles.google}>
                <Image
                  source={require('../../../assets/brand/google-g.png')}
                  style={styles.googleMark}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
                <AppText variant="heading" style={styles.googleLabel}>
                  Continue with Google
                </AppText>
              </PressableScale>

              <View style={styles.signupRow}>
                <AppText style={styles.signupPrompt}>New here?</AppText>
                <PressableScale
                  onPress={onCreateAccount}
                  scaleTo={0.96}
                  hitSlop={6}
                  accessibilityRole="button">
                  <AppText style={styles.signupLink}>Create an account</AppText>
                </PressableScale>
              </View>
            </Stagger>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ink,
  },
  fill: {
    flex: 1,
  },
  hero: {
    width: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(34, 32, 27, 0.28)',
  },
  heroContent: {
    flex: 1,
    paddingHorizontal: spacing.xxl,
    paddingBottom: 46,
  },
  markSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backHit: {
    width: 40,
    height: 40,
  },
  backShadow: {
    width: 40,
    height: 40,
    borderRadius: 20,
    ...Platform.select({
      ios: {
        shadowColor: '#78643C',
        shadowOpacity: 0.15,
        shadowRadius: 10,
        shadowOffset: {width: 0, height: 2},
      },
      default: {elevation: 3, shadowColor: '#78643C'},
    }),
  },
  backClip: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.07)',
  },
  backTint: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ffffffcc',
  },
  headlineBlock: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fonts.interSemi,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    color: colors.orb,
  },
  headline: {
    fontSize: 32,
    lineHeight: 35,
    letterSpacing: -0.8,
    maxWidth: 280,
  },
  sheet: {
    flex: 1,
    marginTop: -28,
    zIndex: 3,
    backgroundColor: colors.sheet,
    borderTopLeftRadius: radii.sheetLogin,
    borderTopRightRadius: radii.sheetLogin,
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
        shadowOpacity: 0.25,
        shadowRadius: 30,
        shadowOffset: {width: 0, height: -8},
      },
      default: {elevation: 12, shadowColor: colors.ink},
    }),
  },
  sheetContent: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 30,
    gap: spacing.lg,
  },
  fieldBlock: {
    gap: spacing.sm,
  },
  fieldLabel: {
    fontFamily: fonts.interSemi,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.3,
    color: colors.inkSecondary,
    marginLeft: 2,
  },
  passwordLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  forgot: {
    fontFamily: fonts.interSemi,
    fontSize: 12,
    lineHeight: 16,
    color: colors.gold,
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
  fieldIcon: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputError: {
    borderColor: colors.danger,
  },
  input: {
    flex: 1,
    fontFamily: fonts.interMedium,
    fontSize: 15,
    color: colors.ink,
    paddingVertical: 0,
  },
  passwordInput: {
    letterSpacing: 0.5,
  },
  error: {
    fontFamily: fonts.interMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.danger,
  },
  actions: {
    gap: spacing.lg,
  },
  signInWrap: {
    marginTop: 6,
  },
  signIn: {
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: colors.ink,
        shadowOpacity: 0.25,
        shadowRadius: 20,
        shadowOffset: {width: 0, height: 8},
      },
      default: {elevation: 6, shadowColor: colors.ink},
    }),
  },
  signInBusy: {
    opacity: 0.72,
  },
  signInLabel: {
    fontSize: 16,
    lineHeight: 21,
    color: colors.sheet,
  },
  google: {
    height: 56,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.googleStroke,
  },
  googleMark: {
    width: 20,
    height: 20,
  },
  googleLabel: {
    fontSize: 16,
    lineHeight: 21,
    color: colors.ink,
  },
  signupRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  signupPrompt: {
    fontFamily: fonts.interMedium,
    fontSize: 13,
    lineHeight: 18,
    color: colors.inkSoft,
  },
  signupLink: {
    fontFamily: fonts.interSemi,
    fontSize: 13,
    lineHeight: 18,
    color: colors.ink,
  },
});
