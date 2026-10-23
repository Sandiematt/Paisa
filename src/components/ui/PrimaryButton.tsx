import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {colors, layout, radii, spacing} from '../../theme';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Optional trailing glyph, e.g. an arrow on a wizard's continue button. */
  trailing?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/** Violet fill, white bold label, fully round. The one primary action. */
export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  trailing,
  style,
  accessibilityHint,
}: PrimaryButtonProps) {
  const labelColor = disabled ? colors.muted : colors.text;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.975}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      accessibilityHint={accessibilityHint}
      containerStyle={style}
      style={[styles.surface, disabled && styles.surfaceDisabled]}>
      <View style={styles.row}>
        <AppText
          variant="heading"
          color={labelColor}
          numberOfLines={1}>
          {label}
        </AppText>
        {trailing ? (
          <AppText variant="heading" color={labelColor} style={styles.trailing}>
            {trailing}
          </AppText>
        ) : null}
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  surface: {
    height: layout.controlHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.violet,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  surfaceDisabled: {
    backgroundColor: colors.canvasSunk,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trailing: {
    marginLeft: spacing.sm,
  },
});
