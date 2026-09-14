import React from 'react';
import {StatusBar, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {Edge, SafeAreaView} from 'react-native-safe-area-context';

import {colors} from '../../theme';

type ScreenProps = {
  children: React.ReactNode;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
  backdrop?: React.ReactNode;
};

export function Screen({
  children,
  edges = ['top', 'bottom'],
  style,
  backdrop,
}: ScreenProps) {
  return (
    <View style={[styles.root, backdrop ? styles.rootWash : null]} collapsable={false}>
      {/* Android is edge-to-edge from RN 0.87, so the canvas behind the bar
          comes from the root view rather than a status bar colour. */}
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />
      {backdrop}
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
  rootWash: {
    backgroundColor: 'transparent',
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
