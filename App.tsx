import React from 'react';
import {StyleSheet} from 'react-native';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {RootNavigator} from './src/app/RootNavigator';
import {AuthProvider} from './src/features/auth/AuthProvider';
import {colors} from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider style={styles.root}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
});
