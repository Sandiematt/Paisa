import React from 'react';
import {Platform, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {BlurView} from '@react-native-community/blur';

import {colors} from '../../theme';

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
 * Frosted glass: native blur with a light tint so the page wash shows through.
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
  const amount = Math.min(BLUR_AMOUNT[intensity], MAX_BLUR_RADIUS);

  return (
    <View style={style}>
      <View style={[styles.clip, {borderRadius: radius}]}>
        <BlurView
          pointerEvents="none"
          style={StyleSheet.absoluteFill}
          blurType="light"
          blurAmount={amount}
          {...(Platform.OS === 'android'
            ? {blurRadius: amount, overlayColor: 'transparent'}
            : {reducedTransparencyFallbackColor: overlayColor})}
        />
        <View
          pointerEvents="none"
          style={[styles.tint, {backgroundColor: overlayColor}]}
        />
        <View pointerEvents="none" style={styles.sheen} />
        <View style={[styles.content, contentStyle]}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
  },
  tint: {
    ...StyleSheet.absoluteFill,
  },
  sheen: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  content: {
    zIndex: 1,
  },
});
