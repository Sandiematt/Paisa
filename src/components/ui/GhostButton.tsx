import React from 'react';
import {StyleProp, StyleSheet, ViewStyle} from 'react-native';

import {colors, spacing} from '../../theme';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type GhostButtonProps = {
  label: string;
  onPress: () => void;
  tone?: 'muted' | 'ink';
  style?: StyleProp<ViewStyle>;
};

/** Low-emphasis action. Used for "Skip for now" on the optional steps. */
export function GhostButton({
  label,
  onPress,
  tone = 'muted',
  style,
}: GhostButtonProps) {
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.96}
      accessibilityRole="button"
      containerStyle={style}
      style={styles.surface}>
      <AppText
        variant="bodyStrong"
        color={tone === 'ink' ? colors.ink : colors.inkSecondary}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  surface: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
