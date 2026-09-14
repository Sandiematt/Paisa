import {TamaguiProvider} from '@tamagui/core';
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {RootNavigator} from './src/app/RootNavigator';
import {AuthProvider} from './src/features/auth/AuthProvider';
import {colors, useAppFonts} from './src/theme';
import {config} from './tamagui.config';

export default function App() {
  const fontsReady = useAppFonts();

  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <SafeAreaProvider style={styles.root}>
        {fontsReady ? (
          <AuthProvider>
            <RootNavigator />
          </AuthProvider>
        ) : (
          <View style={styles.root} />
        )}
      </SafeAreaProvider>
    </TamaguiProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
});
