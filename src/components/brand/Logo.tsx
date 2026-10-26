import React from 'react';
import {Image, StyleSheet, View} from 'react-native';

type LogoProps = {
  /** Height of the logo box. The artwork is 3:2, so the width is 1.5× this. */
  size?: number;
  /**
   * Crops the transparent margin around the artwork so the mark's own edge
   * lines up with the content beside it, for a left-aligned layout. The
   * artwork keeps the same scale as an untrimmed logo of the same size.
   */
  trim?: boolean;
};

const ASPECT = 1536 / 1024;

// Opaque bounds of assets/logo/logo.png (1536×1024), as fractions of the image.
const ART = {
  left: 369 / 1536,
  top: 108 / 1024,
  width: (1169 - 369) / 1536,
  height: (937 - 108) / 1024,
};

/**
 * The violet mark over the white "Paisa" wordmark. The asset is a
 * transparent PNG drawn for the dark DX ground, so it sits on the screen
 * directly with no frame: a tile would hide the white wordmark.
 */
export function Logo({size = 132, trim = false}: LogoProps) {
  const width = Math.round(size * ASPECT);
  const image = (
    <Image
      source={require('../../../assets/logo/logo.png')}
      style={[
        trim ? null : styles.centered,
        {height: size, width},
        trim ? {marginLeft: -width * ART.left, marginTop: -size * ART.top} : null,
      ]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Paisa"
    />
  );
  if (!trim) {
    return image;
  }
  return (
    <View
      style={[
        styles.trimmed,
        {width: Math.round(width * ART.width), height: Math.round(size * ART.height)},
      ]}>
      {image}
    </View>
  );
}

const styles = StyleSheet.create({
  centered: {
    alignSelf: 'center',
  },
  trimmed: {
    overflow: 'hidden',
  },
});
