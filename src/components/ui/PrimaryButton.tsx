import React from 'react';
import {StyleProp, View, ViewStyle} from 'react-native';

import {colors, layout, makeStyles, radii, spacing} from '../../theme';
import {AppText} from './AppText';
import {Loader} from './Loader';
import {PressableScale} from './PressableScale';

type PrimaryButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  /** Shows the loading animation beside the label (and blocks presses). */
  loading?: boolean;
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
  loading = false,
  trailing,
  style,
  accessibilityHint,
}: PrimaryButtonProps) {
  const styles = useStyles();
  const labelColor = disabled ? colors.muted : colors.onAccent;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      scaleTo={0.975}
      accessibilityRole="button"
      accessibilityState={{disabled}}
      accessibilityHint={accessibilityHint}
      containerStyle={style}
      style={[styles.surface, disabled && styles.surfaceDisabled]}>
      <View style={styles.row}>
        {loading ? <Loader size={24} color={labelColor} style={styles.loader} /> : null}
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

const useStyles = makeStyles(() => ({
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
  loader: {
    marginRight: spacing.sm,
  },
}));
