import React from 'react';
import {Image, StyleSheet} from 'react-native';

type LogoProps = {
  /** Height of the logo box. The artwork is 3:2, so the width is 1.5× this. */
  size?: number;
};

const ASPECT = 1536 / 1024;

/**
 * The violet mark over the white "Paisa" wordmark. The asset is a
 * transparent PNG drawn for the dark DX ground, so it sits on the screen
 * directly with no frame: a tile would hide the white wordmark.
 */
export function Logo({size = 132}: LogoProps) {
  return (
    <Image
      source={require('../../../assets/logo/logo.png')}
      style={[styles.image, {height: size, width: Math.round(size * ASPECT)}]}
      resizeMode="contain"
      accessibilityRole="image"
      accessibilityLabel="Paisa"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    alignSelf: 'center',
  },
});
