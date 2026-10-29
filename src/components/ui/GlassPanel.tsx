import React from 'react';
import {Platform, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {BlurView} from '@react-native-community/blur';

import {colors, makeStyles, useTheme} from '../../theme';

type GlassIntensity = 'md' | 'xl' | '2xl';

const MAX_BLUR_RADIUS = 25;

const BLUR_AMOUNT: Record<GlassIntensity, number> = {
  md: 12,
  xl: 24,
  '2xl': MAX_BLUR_RADIUS,
};

type GlassPanelProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  intensity?: GlassIntensity;
  overlayColor?: string;
  radius: number;
};

/**
 * Glass: native blur (dark or light to match the scheme) under a `glass` tint with a 1px `line` border.
 * Shadow belongs on the outer wrap so overflow clipping does not eat it.
 */
export function GlassPanel({
  children,
  style,
  contentStyle,
  intensity = 'xl',
  overlayColor = colors.glass,
  radius,
}: GlassPanelProps) {
  const styles = useStyles();
  const {scheme} = useTheme();
  const amount = Math.min(BLUR_AMOUNT[intensity], MAX_BLUR_RADIUS);

  return (
    <View style={style}>
      <View style={[styles.clip, {borderRadius: radius}]}>
        <BlurView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          blurType={scheme === 'light' ? 'light' : 'dark'}
          blurAmount={amount}
          {...(Platform.OS === 'android'
            ? {blurRadius: amount, overlayColor: 'transparent'}
            : {reducedTransparencyFallbackColor: colors.surface})}
        />
        <View
          pointerEvents="none"
          style={[styles.tint, {backgroundColor: overlayColor}]}
        />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  clip: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  tint: {
    ...StyleSheet.absoluteFill,
  },
  content: {
    zIndex: 1,
  },
}));
