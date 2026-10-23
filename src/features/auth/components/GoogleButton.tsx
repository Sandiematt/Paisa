import React from 'react';
import {Image, StyleProp, StyleSheet, ViewStyle} from 'react-native';

import {SecondaryButton} from '../../../components/ui';

type GoogleButtonProps = {
  label: string;
  onPress: () => void;
  /** Dims the button and ignores presses, e.g. while a sign-in is in flight. */
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Official Google G (FirebaseUI asset) on a surface button with a line border,
 * so the coloured mark is the only colour on the row.
 */
export function GoogleButton({
  label,
  onPress,
  disabled = false,
  style,
}: GoogleButtonProps) {
  return (
    <SecondaryButton
      label={label}
      onPress={onPress}
      style={[style, disabled ? styles.disabled : null]}
      accessibilityHint="Opens Google to sign in"
      leading={
        <Image
          source={require('../../../../assets/brand/google-g.png')}
          style={styles.mark}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      }
    />
  );
}

const styles = StyleSheet.create({
  mark: {
    width: 20,
    height: 20,
  },
  disabled: {
    opacity: 0.5,
    pointerEvents: 'none',
  },
});
