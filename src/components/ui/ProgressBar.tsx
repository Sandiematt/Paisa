import React, {useEffect, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, StyleSheet, View} from 'react-native';

import {colors, duration, easing, radii} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

type ProgressBarProps = {
  /** 0 to 1. */
  progress: number;
  color?: string;
  /** Wonder budget/savings bars: gold→coral or green→lime. */
  gradient?: [string, string];
};

function mixHex(a: string, b: string, t: number): string {
  const parse = (hex: string) => {
    const h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ] as const;
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

/**
 * Fill is driven by `scaleX` with a compensating `translateX` so the whole
 * thing rides the native driver. Animating `width` would trigger layout on
 * every frame.
 */
export function ProgressBar({progress, color = colors.accent, gradient}: ProgressBarProps) {
  const reducedMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const value = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    Animated.timing(value, {
      toValue: progress,
      duration: reducedMotion ? 0 : duration.screenEnter,
      easing: easing.screen,
      useNativeDriver: true,
    }).start();
  }, [progress, reducedMotion, value]);

  const onLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const translateX = Animated.multiply(Animated.add(value, -1), trackWidth / 2);
  const stops = gradient
    ? Array.from({length: 12}, (_, index) => mixHex(gradient[0], gradient[1], index / 11))
    : null;

  return (
    <View style={styles.track} onLayout={onLayout} accessibilityRole="progressbar">
      <Animated.View
        style={[
          styles.fill,
          {
            width: trackWidth,
            backgroundColor: stops ? undefined : color,
            transform: [{translateX}, {scaleX: value}],
          },
        ]}>
        {stops ? (
          <View style={styles.gradientRow}>
            {stops.map((stop, index) => (
              <View key={index} style={[styles.gradientStop, {backgroundColor: stop}]} />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.track,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  gradientRow: {
    flex: 1,
    flexDirection: 'row',
  },
  gradientStop: {
    flex: 1,
    height: 6,
  },
});
