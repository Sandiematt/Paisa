import {TamaguiProvider} from '@tamagui/core';
import React from 'react';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {RootNavigator} from './src/app/RootNavigator';
import {AuthProvider} from './src/features/auth/AuthProvider';
import {colors} from './src/theme';
import {config} from './tamagui.config';

export default function App() {
  return (
    <TamaguiProvider config={config} defaultTheme="light">
      <SafeAreaProvider style={styles.root}>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
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
