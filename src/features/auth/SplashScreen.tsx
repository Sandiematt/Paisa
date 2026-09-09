import React from 'react';
import {StyleSheet, View} from 'react-native';

import {Logo} from '../../components/brand/Logo';
import {AppText, PrimaryButton, Screen, Stagger} from '../../components/ui';
import {colors, layout, spacing} from '../../theme';

type SplashScreenProps = {
  onGetStarted: () => void;
};

/**
 * Root of the stack, so there is no back affordance here by design.
 */
export function SplashScreen({onGetStarted}: SplashScreenProps) {
  return (
    <Screen>
      <View style={styles.root}>
        <View style={styles.center}>
          <Stagger index={0} style={styles.logo}>
            <Logo />
          </Stagger>

          <Stagger index={1} style={styles.copy}>
            <AppText variant="display" align="center" style={styles.headline}>
              Every rupee, accounted for.
            </AppText>
            <AppText
              variant="body"
              color={colors.inkSecondary}
              align="center"
              style={styles.subtitle}>
              Log what you spend, see where it goes, and keep the month on
              budget.
            </AppText>
          </Stagger>
        </View>

        <Stagger index={2}>
          <PrimaryButton
            label="Get started"
            trailing={'\u2192'}
            onPress={onGetStarted}
          />
        </Stagger>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: layout.screenPadding,
    paddingBottom: spacing.xxl,
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
    marginTop: spacing.section,
    alignItems: 'center',
  },
  headline: {
    width: '100%',
  },
  subtitle: {
    marginTop: spacing.md,
    maxWidth: 300,
  },
});
