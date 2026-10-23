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

/** Surface fill with a 1px line border. Sits between primary and ghost. */
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
        <AppText variant="heading" color={colors.text} numberOfLines={1}>
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
    borderWidth: 1,
    borderColor: colors.line,
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
