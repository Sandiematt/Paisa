import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {GradientKey, colors, radii, spacing} from '../../theme';
import {AppText} from './AppText';
import {GradientIconSquare} from './GradientIconSquare';
import {PressableScale} from './PressableScale';

type BannerPillProps = {
  /** Icon drawn inside the 40px gradient square (~20px, `colors.text`). */
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Gradient for the icon square. Default `'savings'` (sky-indigo). */
  iconGradient?: GradientKey;
  /** Right-hand action: a caret, a close icon, a small link. */
  trailing?: React.ReactNode;
  /** Makes the whole pill tappable. */
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * Rounded-full `surface` card: icon square, two lines (15/600 title, 13 muted
 * sub) and a trailing action. Used for the home nudge and similar prompts.
 */
export function BannerPill({
  icon,
  title,
  subtitle,
  iconGradient = 'savings',
  trailing,
  onPress,
  style,
  accessibilityLabel,
  accessibilityHint,
}: BannerPillProps) {
  const body = (
    <View style={[styles.pill, style]}>
      <GradientIconSquare size={40} gradient={iconGradient}>
        {icon}
      </GradientIconSquare>
      <View style={styles.text}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="label" color={colors.muted} numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {trailing}
    </View>
  );

  if (!onPress) {
    return body;
  }
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.985}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}>
      {body}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingLeft: spacing.lg,
    paddingRight: 14,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  text: {
    flex: 1,
  },
});
