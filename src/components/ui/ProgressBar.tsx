import React, {useEffect, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, StyleSheet, View} from 'react-native';

import {GradientKey, colors, duration, easing, linearGradient, radii} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

type ProgressBarProps = {
  /** 0 to 1. */
  progress: number;
  /** Solid fill. Ignored when a gradient is in play. */
  color?: string;
  /**
   * Fill gradient: a named DX gradient (`'primary'`, `'rose'`, ...) or explicit
   * stops. Defaults to `'primary'` (lavender to violet) when no `color` is set.
   */
  gradient?: GradientKey | readonly string[];
  /** Bar thickness. DX uses 4 to 10. Default 6. */
  height?: number;
};

/**
 * Thin progress bar: `line` track, gradient fill. The fill is driven by
 * `scaleX` with a compensating `translateX` so it rides the native driver;
 * animating `width` would trigger layout every frame.
 */
export function ProgressBar({
  progress,
  color,
  gradient,
  height = 6,
}: ProgressBarProps) {
  const reducedMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const clamped = Math.max(0, Math.min(1, progress));
  const value = useRef(new Animated.Value(clamped)).current;

  useEffect(() => {
    Animated.timing(value, {
      toValue: clamped,
      duration: reducedMotion ? 0 : duration.screenEnter,
      easing: easing.screen,
      useNativeDriver: true,
    }).start();
  }, [clamped, reducedMotion, value]);

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const translateX = Animated.multiply(Animated.add(value, -1), trackWidth / 2);
  const solid = color != null && gradient == null;
  const fillStyle = solid
    ? {backgroundColor: color}
    : {backgroundImage: linearGradient(gradient ?? 'primary', 90)};

  return (
    <View
      style={[styles.track, {height, borderRadius: height / 2}]}
      onLayout={onLayout}
      accessibilityRole="progressbar"
      accessibilityValue={{min: 0, max: 100, now: Math.round(clamped * 100)}}>
      <Animated.View
        style={[
          {
            height,
            borderRadius: height / 2,
            width: trackWidth,
            transform: [{translateX}, {scaleX: value}],
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    backgroundColor: colors.line,
    overflow: 'hidden',
    borderRadius: radii.pill,
  },
});
