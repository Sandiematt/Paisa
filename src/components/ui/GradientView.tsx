import React from 'react';
import {StyleProp, View, ViewProps, ViewStyle} from 'react-native';

import {GradientKey, linearGradient} from '../../theme';

type GradientViewProps = ViewProps & {
  /** A named DX gradient, or explicit colour stops. */
  gradient: GradientKey | readonly string[];
  /** CSS angle in degrees. Defaults to the gradient's design angle. */
  angle?: number;
  /** Optional 0..1 stop positions (one per colour). */
  positions?: readonly number[];
  style?: StyleProp<ViewStyle>;
};

/**
 * A View filled with a linear gradient (RN 0.87 `backgroundImage`). Round the
 * corners with `borderRadius` + `overflow: 'hidden'` in `style` as usual.
 *
 *   <GradientView gradient="primary" style={{height: 8, borderRadius: 4}} />
 */
export function GradientView({
  gradient,
  angle,
  positions,
  style,
  children,
  ...rest
}: GradientViewProps) {
  return (
    <View
      {...rest}
      style={[{backgroundImage: linearGradient(gradient, angle, positions)}, style]}>
      {children}
    </View>
  );
}
