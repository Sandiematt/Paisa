import React, {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

import {colors} from '../../theme';

const STOPS: [number, number, number, number][] = [
  [0, 208, 172, 88],
  [0.10, 218, 185, 110],
  [0.22, 232, 205, 142],
  [0.38, 240, 222, 180],
  [0.55, 237, 229, 214],
  [1, 237, 229, 214],
];

const BANDS = 56;

function sample(t: number): string {
  const x = Math.min(1, Math.max(0, t));
  let i = 0;
  while (i < STOPS.length - 2 && STOPS[i + 1][0] < x) {
    i += 1;
  }
  const a = STOPS[i];
  const b = STOPS[i + 1];
  const span = b[0] - a[0] || 1;
  const u = (x - a[0]) / span;
  const r = Math.round(a[1] + (b[1] - a[1]) * u);
  const g = Math.round(a[2] + (b[2] - a[2]) * u);
  const bl = Math.round(a[3] + (b[3] - a[3]) * u);
  return `rgb(${r},${g},${bl})`;
}

function Orb({
  size,
  color,
  style,
}: {
  size: number;
  color: string;
  style: object;
}) {
  const rings = [
    {scale: 1.55, opacity: 0.20},
    {scale: 1.28, opacity: 0.36},
    {scale: 1, opacity: 0.62},
  ];

  return (
    <View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
        },
        style,
      ]}>
      {rings.map(ring => {
        const dim = size * ring.scale;
        const offset = (size - dim) / 2;
        return (
          <View
            key={ring.scale}
            style={{
              position: 'absolute',
              left: offset,
              top: offset,
              width: dim,
              height: dim,
              borderRadius: dim / 2,
              backgroundColor: color,
              opacity: ring.opacity,
            }}
          />
        );
      })}
    </View>
  );
}

export function HomeAmbient() {
  const bands = useMemo(
    () => Array.from({length: BANDS}, (_, index) => sample(index / (BANDS - 1))),
    [],
  );

  return (
    <View pointerEvents="none" style={styles.wash} accessible={false}>
      {bands.map((backgroundColor, index) => (
        <View key={index} style={[styles.band, {backgroundColor}]} />
      ))}
      <Orb size={380} color={colors.orb} style={styles.orbOne} />
      <Orb size={340} color={colors.orbPeach} style={styles.orbTwo} />
      <Orb size={280} color={colors.orbSand} style={styles.orbThree} />
    </View>
  );
}

const styles = StyleSheet.create({
  wash: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
  },
  band: {
    flex: 1,
  },
  orbOne: {
    left: -60,
    top: -80,
  },
  orbTwo: {
    right: -80,
    top: 420,
  },
  orbThree: {
    left: 40,
    bottom: 40,
  },
});
