import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';

import {GradientKey, makeStyles, shadows} from '../../theme';
import {GradientView} from './GradientView';

type GradientIconSquareProps = {
  /** Square edge. DX uses 34 (cards), 38 (quick tiles), 40 (banners). */
  size?: number;
  /** Named gradient. `'primary'` (lavender-violet) or `'savings'` (sky-indigo). */
  gradient?: GradientKey;
  /** Violet glow under the square, as on the home quick tiles. */
  glow?: boolean;
  /** The icon; render it ~half the size, in `colors.onAccent`. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Rounded gradient square holding an icon (radius is ~31% of the size, so
 * 34 gives 11 and 38 to 40 give 12).
 *
 *   <GradientIconSquare size={38} glow>
 *     <Receipt size={18} color={colors.onAccent} weight="fill" />
 *   </GradientIconSquare>
 */
export function GradientIconSquare({
  size = 38,
  gradient = 'primary',
  glow = false,
  children,
  style,
}: GradientIconSquareProps) {
  const styles = useStyles();
  return (
    <GradientView
      gradient={gradient}
      style={[
        styles.base,
        {width: size, height: size, borderRadius: Math.round(size * 0.31)},
        glow ? shadows.iconGlow : null,
        style,
      ]}>
      {children}
    </GradientView>
  );
}

const useStyles = makeStyles(() => ({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
