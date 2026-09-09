import React from 'react';
import {Image, StyleProp, StyleSheet, ViewStyle} from 'react-native';

import {SecondaryButton} from '../../../components/ui';

type GoogleButtonProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Official Google G (FirebaseUI asset). Auth itself is still a stub. */
export function GoogleButton({label, onPress, style}: GoogleButtonProps) {
  return (
    <SecondaryButton
      label={label}
      onPress={onPress}
      style={style}
      accessibilityHint="Google sign-in is not connected yet"
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
    width: 18,
    height: 18,
  },
});
