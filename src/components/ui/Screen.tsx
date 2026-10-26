import React, {useId} from 'react';
import {StatusBar, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {Edge, SafeAreaView} from 'react-native-safe-area-context';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';

import {colors} from '../../theme';

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

// The glow fades its own opacity along an ease-out curve instead of blending
// two colours linearly: a straight glow-to-ground ramp left a visible edge
// where it stopped, and Android drew a dark band near the bottom of it.
const GLOW_STOPS = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map(offset => ({
  offset,
  opacity: (1 - offset) ** 2,
}));

function ScreenGlow({height}: {height: number}) {
  const id = `screen-glow-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  return (
    <Svg
      pointerEvents="none"
      width="100%"
      height={height}
      style={styles.glow}>
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          {GLOW_STOPS.map(stop => (
            <Stop
              key={stop.offset}
              offset={stop.offset}
              stopColor={colors.glow}
              stopOpacity={stop.opacity}
            />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

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
      {glow ? <ScreenGlow height={glowHeight} /> : null}
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
