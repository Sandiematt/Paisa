import React from 'react';
import {StyleProp, ViewStyle} from 'react-native';

import {colors, makeStyles, spacing} from '../../theme';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type GhostButtonProps = {
  label: string;
  onPress: () => void;
  tone?: 'muted' | 'ink';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Low-emphasis action. Used for "Skip for now" on the optional steps. */
export function GhostButton({
  label,
  onPress,
  tone = 'muted',
  disabled = false,
  style,
}: GhostButtonProps) {
  const styles = useStyles();
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.96}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      containerStyle={[style, disabled && styles.disabled]}
      style={styles.surface}>
      <AppText
        variant="bodyStrong"
        color={tone === 'ink' ? colors.ink : colors.inkSecondary}>
        {label}
      </AppText>
    </PressableScale>
  );
}

const useStyles = makeStyles(() => ({
  disabled: {
    opacity: 0.5,
  },
  surface: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
