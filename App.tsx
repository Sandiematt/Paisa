import React, {useCallback, useState} from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {RootNavigator} from './src/app/RootNavigator';
import {AuthProvider, useAuth} from './src/features/auth/AuthProvider';
import {AutoTrackProvider} from './src/features/autotrack/AutoTrackProvider';
import {NotificationsProvider} from './src/features/notifications/NotificationsProvider';
import {BiometricLockProvider} from './src/features/security/BiometricLockProvider';
import {LaunchSplash} from './src/features/splash/LaunchSplash';
import {UpdateBanner} from './src/features/updates/UpdateBanner';
import {useOtaUpdate} from './src/features/updates/useOtaUpdate';
import {ThemeProvider, colors, makeStyles, useAppFonts} from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider style={rootStyles.fill}>
      <ThemeProvider>
        <AppRoot />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function AppRoot() {
  const fontsReady = useAppFonts();
  const styles = useStyles();

  return fontsReady ? (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  ) : (
    <View style={styles.root} />
  );
}

/**
 * The app boots underneath the launch splash, so auth and the first screen
 * are ready by the time the mark finishes. The biometric lock waits for the
 * splash to leave so its prompt doesn't cover the animation. OTA updates
 * download from launch but only surface once the splash is gone.
 */
function AppShell() {
  const {ready} = useAuth();
  const [splashDone, setSplashDone] = useState(false);
  const finishSplash = useCallback(() => setSplashDone(true), []);
  const update = useOtaUpdate();

  return (
    <>
      <BiometricLockProvider suspended={!splashDone}>
        <NotificationsProvider>
          <AutoTrackProvider>
            <RootNavigator />
          </AutoTrackProvider>
        </NotificationsProvider>
      </BiometricLockProvider>
      <UpdateBanner {...update} visible={splashDone} />
      {splashDone ? null : (
        <LaunchSplash ready={ready} onDone={finishSplash} />
      )}
    </>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
  },
}));

const rootStyles = StyleSheet.create({
  fill: {flex: 1},
});
