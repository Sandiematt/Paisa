import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet} from 'react-native';

import {colors, duration, easing, radii, spacing, typography} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {PressableScale} from './PressableScale';

type TogglePillProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
};

/**
 * Single-choice pill, styled after the active segment in the report header.
 * Background and label cross-fade together on one JS-driven value so the text
 * never sits unreadable on a half-swapped fill.
 */
export function TogglePill({label, selected, onPress}: TogglePillProps) {
  const reducedMotion = useReducedMotion();
  const active = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(active, {
      toValue: selected ? 1 : 0,
      duration: reducedMotion ? 0 : duration.swap,
      easing: easing.standard,
      useNativeDriver: false,
    }).start();
  }, [active, reducedMotion, selected]);

  const backgroundColor = active.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.surface, colors.ink],
  });

  const borderColor = active.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.hairline, colors.ink],
  });

  const color = active.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.inkSecondary, colors.onInk],
  });

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.94}
      accessibilityRole="radio"
      accessibilityState={{selected}}>
      <Animated.View style={[styles.pill, {backgroundColor, borderColor}]}>
        <Animated.Text style={[styles.label, {color}]}>{label}</Animated.Text>
      </Animated.View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
  label: {
    ...typography.bodyStrong,
  },
});
