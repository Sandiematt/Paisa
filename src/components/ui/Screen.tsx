import React from 'react';
import {StatusBar, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {Edge, SafeAreaView} from 'react-native-safe-area-context';

import {colors} from '../../theme';

type ScreenProps = {
  children: React.ReactNode;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
};

export function Screen({
  children,
  edges = ['top', 'bottom'],
  style,
}: ScreenProps) {
  return (
    <View style={styles.root} collapsable={false}>
      {/* Android is edge-to-edge from RN 0.87, so the canvas behind the bar
          comes from the root view rather than a status bar colour. */}
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={[styles.safe, style]} edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  safe: {
    flex: 1,
  },
});
