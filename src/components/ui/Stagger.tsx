import React, {useContext, useEffect, useRef} from 'react';
import {Animated, StyleProp, ViewStyle} from 'react-native';

import {duration, easing, staggerStep, travel} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {SwapInFlightContext} from './SwapContext';

type StaggerProps = {
  /** Position in the reveal sequence, starting at 0. */
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Reveals a block shortly after the one above it, walking the eye down the
 * screen in reading order.
 *
 * Skipped entirely when the screen arrived via a swap: the slide is already
 * the entrance, and a second reveal layered on top of it is what read as a
 * flicker. Captured at mount, because the swap finishes while these are still
 * on screen and a reveal must never start half way through.
 */
export function Stagger({index = 0, style, children}: StaggerProps) {
  const reducedMotion = useReducedMotion();
  const arrivedDuringSwap = useRef(useContext(SwapInFlightContext)).current;
  const progress = useRef(
    new Animated.Value(arrivedDuringSwap ? 1 : 0),
  ).current;

  useEffect(() => {
    if (arrivedDuringSwap || reducedMotion) {
      progress.setValue(1);
      return;
    }

    Animated.timing(progress, {
      toValue: 1,
      delay: index * staggerStep,
      duration: duration.reveal,
      easing: easing.screen,
      useNativeDriver: true,
    }).start();
  }, [arrivedDuringSwap, index, progress, reducedMotion]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [travel.reveal, 0],
  });

  return (
    <Animated.View
      style={[style, {opacity: progress, transform: [{translateY}]}]}>
      {children}
    </Animated.View>
  );
}
