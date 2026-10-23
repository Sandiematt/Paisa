import React, {useEffect, useRef} from 'react';
import {Animated, Pressable, StyleProp, StyleSheet, ViewStyle} from 'react-native';

import {colors, duration, easing} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

type ToggleSwitchProps = {
  value: boolean;
  onValueChange: (next: boolean) => void;
  disabled?: boolean;
  /** Spoken name. Required for a11y, e.g. "Budget alerts". */
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
};

export const TOGGLE_WIDTH = 46;
export const TOGGLE_HEIGHT = 28;
const PAD = 3;
const KNOB = 22;
const TRAVEL = TOGGLE_WIDTH - KNOB - PAD * 2; // inner width is 46 - 2*(PAD) after border+padding

/**
 * 46x28 switch. On: violet track, `text` knob. Off: `surfaceRaised` track,
 * 1px `line` border, muted knob. Exposes the `switch` role.
 */
export function ToggleSwitch({
  value,
  onValueChange,
  disabled = false,
  accessibilityLabel,
  style,
}: ToggleSwitchProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(value ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: value ? 1 : 0,
      duration: reducedMotion ? 0 : duration.control,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [progress, reducedMotion, value]);

  const knobX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, TRAVEL],
  });
  const offKnobOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  return (
    <Pressable
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{checked: value, disabled}}
      style={[styles.track, disabled && styles.disabled, style]}>
      {/* Violet track fades in over the raised off-track. */}
      <Animated.View
        pointerEvents="none"
        style={[styles.onTrack, {opacity: progress}]}
      />
      <Animated.View
        pointerEvents="none"
        style={[styles.knob, {transform: [{translateX: knobX}]}]}>
        <Animated.View
          style={[styles.knobOff, {opacity: offKnobOpacity}]}
        />
        <Animated.View style={[styles.knobOn, {opacity: progress}]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TOGGLE_WIDTH,
    height: TOGGLE_HEIGHT,
    borderRadius: TOGGLE_HEIGHT / 2,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.line,
    padding: PAD - 1,
    overflow: 'hidden',
  },
  disabled: {
    opacity: 0.5,
  },
  onTrack: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.violet,
  },
  knob: {
    width: KNOB,
    height: KNOB,
    borderRadius: KNOB / 2,
  },
  knobOff: {
    ...StyleSheet.absoluteFill,
    borderRadius: KNOB / 2,
    backgroundColor: colors.muted,
  },
  knobOn: {
    ...StyleSheet.absoluteFill,
    borderRadius: KNOB / 2,
    backgroundColor: colors.text,
  },
});
