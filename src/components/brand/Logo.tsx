import React from 'react';
import {Image, StyleSheet, View} from 'react-native';

import {colors, radii, spacing} from '../../theme';

type LogoProps = {
  size?: number;
};

/**
 * The supplied logo ships on an opaque white background, so it is framed as a
 * white tile rather than dropped straight onto the cream canvas, where the
 * bounding box would show as a rectangle. Swap the frame for a bare `Image`
 * once a transparent asset exists.
 */
export function Logo({size = 132}: LogoProps) {
  return (
    <View style={[styles.tile, {width: size, height: size}]}>
      <Image
        source={require('../../../assets/logo/logo.png')}
        style={styles.image}
        resizeMode="contain"
        accessibilityRole="image"
        accessibilityLabel="Paisa"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: radii.card,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    padding: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
