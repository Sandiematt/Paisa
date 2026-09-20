import React from 'react';
import {StyleSheet, View, type ViewStyle} from 'react-native';

import {colors} from '../../theme';

/**
 * Wonder InsightsScreen backdrop — same warm-orb construction as HomeAmbient,
 * but no top-to-bottom wash: the canvas stays a flat parchment fill and three
 * blurred orbs (simulated with radial gradients) glow through the glass cards.
 */
function glow(hex: string): NonNullable<ViewStyle['backgroundImage']> {
  return [
    {
      type: 'radial-gradient',
      shape: 'circle',
      size: 'farthest-side',
      position: {top: '50%', left: '50%'},
      colorStops: [
        {color: hex, positions: ['0%']},
        {color: withAlpha(hex, 0.55), positions: ['34%']},
        {color: withAlpha(hex, 0.18), positions: ['58%']},
        {color: withAlpha(hex, 0), positions: ['78%']},
      ],
    },
  ];
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function InsightsAmbient() {
  return (
    <View pointerEvents="none" style={styles.wash} accessible={false}>
      <View style={[styles.orb, styles.orbOne]} />
      <View style={[styles.orb, styles.orbTwo]} />
      <View style={[styles.orb, styles.orbThree]} />
    </View>
  );
}

const styles = StyleSheet.create({
  wash: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: colors.canvas,
  },
  orb: {
    position: 'absolute',
    borderRadius: 9999,
  },
  // Wonder Warm Orb One: 380px #f0c878, blur 120, left -60, top -80
  orbOne: {
    width: 620,
    height: 620,
    left: -180,
    top: -200,
    backgroundImage: glow(colors.orb),
  },
  // Wonder Warm Orb Two: 340px #e7b98a, blur 130, top 440, right -80
  orbTwo: {
    width: 600,
    height: 600,
    right: -210,
    top: 310,
    backgroundImage: glow(colors.orbPeach),
  },
  // Wonder Warm Orb Three: 320px #e3d2a8, blur 150, left 40, bottom 40
  orbThree: {
    width: 620,
    height: 620,
    left: -110,
    bottom: -110,
    backgroundImage: glow(colors.orbSand),
  },
});
