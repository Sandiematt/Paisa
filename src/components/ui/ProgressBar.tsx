import React, {useEffect, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, StyleSheet, View} from 'react-native';

import {colors, duration, easing, radii} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

type ProgressBarProps = {
  /** 0 to 1. */
  progress: number;
  color?: string;
};

/**
 * Fill is driven by `scaleX` with a compensating `translateX` so the whole
 * thing rides the native driver. Animating `width` would trigger layout on
 * every frame.
 */
export function ProgressBar({progress, color = colors.accent}: ProgressBarProps) {
  const reducedMotion = useReducedMotion();
  const [trackWidth, setTrackWidth] = useState(0);
  const value = useRef(new Animated.Value(progress)).current;

  useEffect(() => {
    // Matched to the step swap so the bar and the arriving content settle
    // together instead of the bar finishing early.
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

  // Scaling happens about the centre, so shift left by half the missing width
  // to keep the fill anchored to the start of the track.
  const translateX = Animated.multiply(
    Animated.add(value, -1),
    trackWidth / 2,
  );

  return (
    <View style={styles.track} onLayout={onLayout} accessibilityRole="progressbar">
      <Animated.View
        style={[
          styles.fill,
          {
            width: trackWidth,
            backgroundColor: color,
            transform: [{translateX}, {scaleX: value}],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairline,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: radii.pill,
  },
});
