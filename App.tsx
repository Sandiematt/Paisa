import React, {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {RootNavigator} from './src/app/RootNavigator';
import {AuthProvider, useAuth} from './src/features/auth/AuthProvider';
import {NotificationsProvider} from './src/features/notifications/NotificationsProvider';
import {BiometricLockProvider} from './src/features/security/BiometricLockProvider';
import {LaunchSplash} from './src/features/splash/LaunchSplash';
import {colors, useAppFonts} from './src/theme';

export default function App() {
  const fontsReady = useAppFonts();

  return (
    <SafeAreaProvider style={styles.root}>
      {fontsReady ? (
        <AuthProvider>
          <AppShell />
        </AuthProvider>
      ) : (
        <View style={styles.root} />
      )}
    </SafeAreaProvider>
  );
}

/**
 * The app boots underneath the launch splash, so auth and the first screen
 * are ready by the time the mark finishes. The biometric lock waits for the
 * splash to leave so its prompt doesn't cover the animation.
 */
function AppShell() {
  const {ready} = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);

  return (
    <>
      <BiometricLockProvider suspended={!splashDone}>
        <NotificationsProvider>
          <RootNavigator />
        </NotificationsProvider>
      </BiometricLockProvider>
      {splashDone ? null : (
        <LaunchSplash ready={ready} onDone={finishSplash} />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
  },
});
