import React from 'react';
import {View} from 'react-native';

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
import {colors, layout, makeStyles, spacing} from '../../theme';
import {GoogleButton} from './components/GoogleButton';

type AuthChoiceScreenProps = {
  onCreateAccount: () => void;
  onSignIn: () => void;
  onGoogle: () => void;
  onBack: () => void;
};

export function AuthChoiceScreen({
  onCreateAccount,
  onSignIn,
  onGoogle,
  onBack,
}: AuthChoiceScreenProps) {
  const styles = useStyles();
  return (
    <Screen glow={360}>
      <ScreenHeader onBack={onBack} />

      <View style={styles.root}>
        <View style={styles.center}>
          <Stagger index={0} style={styles.logo}>
            <Logo size={150} />
          </Stagger>

          <Stagger index={1} style={styles.copy}>
            <AppText variant="display" align="center" style={styles.headline}>
              Let's set you up.
            </AppText>
            <AppText
              variant="body"
              color={colors.muted}
              align="center"
              style={styles.subtitle}>
              Setup takes about a minute, and you can change any of it later.
            </AppText>
          </Stagger>
        </View>

        <Stagger index={2}>
          <PrimaryButton
            label="Create account"
            onPress={onCreateAccount}
            accessibilityHint="Starts setup"
          />

          <DividerLabel label="or" style={styles.divider} />

          <GoogleButton label="Sign up with Google" onPress={onGoogle} />

          <View style={styles.footer}>
            <AppText variant="body" color={colors.muted}>
              Already have an account?
            </AppText>
            <PressableScale
              onPress={onSignIn}
              scaleTo={0.96}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Sign in"
              style={styles.signInLink}>
              <AppText variant="bodyStrong" color={colors.lavender}>
                Sign in
              </AppText>
            </PressableScale>
          </View>
        </Stagger>
      </View>
    </Screen>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.lg,
  },
  center: {
    flex: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    alignItems: 'center',
  },
  copy: {
    width: '100%',
    marginTop: spacing.xxxl,
    alignItems: 'center',
  },
  headline: {
    width: '100%',
  },
  subtitle: {
    marginTop: spacing.md,
    maxWidth: 300,
  },
  divider: {
    marginVertical: spacing.lg,
  },
  signInLink: {
    paddingVertical: spacing.md,
    paddingLeft: spacing.sm,
  },
  footer: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
