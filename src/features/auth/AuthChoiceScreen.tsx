import React from 'react';
import {StyleSheet, View} from 'react-native';

import {Logo} from '../../components/brand/Logo';
import {
  AppText,
  DividerLabel,
  GhostButton,
  PrimaryButton,
  Screen,
  ScreenHeader,
  Stagger,
} from '../../components/ui';
import {colors, layout, spacing} from '../../theme';
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
  return (
    <Screen>
      <ScreenHeader onBack={onBack} />

      <View style={styles.root}>
        <View style={styles.center}>
          <Stagger index={0} style={styles.logo}>
            <Logo size={96} />
          </Stagger>

          <Stagger index={1} style={styles.copy}>
            <AppText variant="title" align="center" style={styles.headline}>
              Let's set you up.
            </AppText>
            <AppText
              variant="body"
              color={colors.inkSecondary}
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

          <GoogleButton label="Sign in with Google" onPress={onGoogle} />

          <View style={styles.footer}>
            <AppText variant="body" color={colors.inkSecondary}>
              Already have an account?
            </AppText>
            <GhostButton label="Sign in" tone="ink" onPress={onSignIn} />
          </View>
        </Stagger>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
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
  footer: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
