import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {RootNavigator} from './src/app/RootNavigator';
import {AuthProvider} from './src/features/auth/AuthProvider';
import {BiometricLockProvider} from './src/features/security/BiometricLockProvider';
import {colors, useAppFonts} from './src/theme';

export default function App() {
  const fontsReady = useAppFonts();

  return (
    <SafeAreaProvider style={styles.root}>
      {fontsReady ? (
        <AuthProvider>
          <BiometricLockProvider>
            <RootNavigator />
          </BiometricLockProvider>
        </AuthProvider>
      ) : (
        <View style={styles.root} />
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
});
