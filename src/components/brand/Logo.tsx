import React from 'react';
import {Image, View} from 'react-native';

import {colors, makeStyles, useTheme} from '../../theme';

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

/** The mark ends at y=651 and the wordmark starts at y=683; split between. */
const WORDMARK_TOP = 667 / 1024;

const SOURCE = require('../../../assets/logo/logo.png');

/**
 * The violet mark over the "Paisa" wordmark. The asset is a transparent PNG
 * drawn for the dark DX ground (white wordmark), so it sits on the screen
 * directly with no frame. On light the wordmark is repainted in `text`: the
 * artwork is drawn twice, the mark untouched above the split and a tinted
 * copy below it.
 */
export function Logo({size = 132, trim = false}: LogoProps) {
  const styles = useStyles();
  const {scheme} = useTheme();
  const width = Math.round(size * ASPECT);
  const box = [
    trim ? null : styles.centered,
    {height: size, width},
    trim ? {marginLeft: -width * ART.left, marginTop: -size * ART.top} : null,
  ];
  const split = Math.round(size * WORDMARK_TOP);
  const image =
    scheme === 'light' ? (
      <View style={box} accessible accessibilityRole="image" accessibilityLabel="Paisa">
        <View style={[styles.clip, {height: split}]}>
          <Image source={SOURCE} style={{height: size, width}} resizeMode="contain" />
        </View>
        <View style={[styles.clip, {height: size - split}]}>
          <Image
            source={SOURCE}
            style={{height: size, width, marginTop: -split, tintColor: colors.text}}
            resizeMode="contain"
          />
        </View>
      </View>
    ) : (
      <Image
        source={SOURCE}
        style={box}
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

const useStyles = makeStyles(() => ({
  centered: {
    alignSelf: 'center',
  },
  trimmed: {
    overflow: 'hidden',
  },
  clip: {
    overflow: 'hidden',
  },
}));
