import React, {useCallback, useRef} from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';

import {duration, easing} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

type PressableScaleProps = Omit<PressableProps, 'style'> & {
  /** How far the surface sinks. Keep subtle: large controls need less. */
  scaleTo?: number;
  /** Visual style of the surface. Also defines the tap target. */
  style?: StyleProp<ViewStyle>;
  /** Layout style for the wrapper, when the parent needs to size the control. */
  containerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Press feedback for every tappable surface in the app. Scale runs on the
 * native driver so it stays responsive while JS is busy.
 */
export function PressableScale({
  scaleTo = 0.97,
  style,
  containerStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: PressableScaleProps) {
  const reducedMotion = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;

  const animate = useCallback(
    (toValue: number) => {
      Animated.timing(scale, {
        toValue,
        duration: duration.press,
        easing: easing.out,
        useNativeDriver: true,
      }).start();
    },
    [scale],
  );

  const handlePressIn = useCallback<NonNullable<PressableProps['onPressIn']>>(
    event => {
      if (!reducedMotion) {
        animate(scaleTo);
      }
      onPressIn?.(event);
    },
    [animate, onPressIn, reducedMotion, scaleTo],
  );

  const handlePressOut = useCallback<NonNullable<PressableProps['onPressOut']>>(
    event => {
      if (!reducedMotion) {
        animate(1);
      }
      onPressOut?.(event);
    },
    [animate, onPressOut, reducedMotion],
  );

  return (
    <Pressable
      {...rest}
      collapsable={false}
      style={containerStyle}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}>
      <Animated.View style={[style, {transform: [{scale}]}]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
