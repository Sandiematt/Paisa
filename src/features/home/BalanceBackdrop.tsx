import React from 'react';
import {Image, StyleSheet} from 'react-native';

/** Source is 167×125 — keep that ratio so the hill is not cropped. */
const WIDTH = 160;
const HEIGHT = 120;

/**
 * Product hill / sprout / sun. Shown in full; the PNG already is just the art.
 */
export function BalanceBackdrop() {
  return (
    <Image
      source={require('../../../assets/illustrations/balance-hill.png')}
      style={styles.art}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  art: {
    width: WIDTH,
    height: HEIGHT,
  },
});
