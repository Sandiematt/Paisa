import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {colors, layout, radii, spacing} from '../../theme';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type SecondaryButtonProps = {
  label: string;
  onPress: () => void;
  leading?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/** White surface with ink text. Sits between the ink fill and a ghost link. */
export function SecondaryButton({
  label,
  onPress,
  leading,
  style,
  accessibilityHint,
}: SecondaryButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.975}
      accessibilityRole="button"
      accessibilityHint={accessibilityHint}
      containerStyle={style}
      style={styles.surface}>
      <View style={styles.row}>
        {leading ? <View style={styles.leading}>{leading}</View> : null}
        <AppText variant="bodyStrong" color={colors.ink} numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  surface: {
    height: layout.controlHeight,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leading: {
    marginRight: spacing.md,
  },
});
