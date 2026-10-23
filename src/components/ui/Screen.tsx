import React from 'react';
import {StatusBar, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {Edge, SafeAreaView} from 'react-native-safe-area-context';

import {colors, linearGradient} from '../../theme';

type ScreenProps = {
  children: React.ReactNode;
  edges?: readonly Edge[];
  style?: StyleProp<ViewStyle>;
  backdrop?: React.ReactNode;
  /** Keeps children above an overlay such as the floating tab bar. */
  bottomInset?: number;
  /**
   * Paints the DX top glow (`glow` fading into `ground`) behind the content.
   * Pass `true` for the default 280px, or a number for a custom height.
   */
  glow?: boolean | number;
};

const GLOW_HEIGHT = 280;

const GLOW_IMAGE = linearGradient([colors.glow, colors.ground], 180);

/** Ground background, light status bar, optional violet glow at the top. */
export function Screen({
  children,
  edges = ['top', 'bottom'],
  style,
  backdrop,
  bottomInset = 0,
  glow = false,
}: ScreenProps) {
  const glowHeight = typeof glow === 'number' ? glow : GLOW_HEIGHT;

  return (
    <View style={styles.root} collapsable={false}>
      {/* Android is edge-to-edge from RN 0.87, so the ground behind the bar
          comes from the root view rather than a status bar colour. */}
      <StatusBar barStyle="light-content" />
      {glow ? (
        <View
          pointerEvents="none"
          style={[styles.glow, {height: glowHeight, backgroundImage: GLOW_IMAGE}]}
        />
      ) : null}
      {backdrop}
      <SafeAreaView
        style={[styles.safe, bottomInset ? {paddingBottom: bottomInset} : null, style]}
        edges={edges}>
        {children}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.ground,
  },
  glow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
