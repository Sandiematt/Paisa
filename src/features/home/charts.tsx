/* Size-driven geometry; StyleSheet cannot take the `size` argument. */
/* eslint-disable react-native/no-inline-styles */
import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText} from '../../components/ui';
import {colors, radii, spacing} from '../../theme';
import {SpendSlice} from './placeholder';

type AreaChartProps = {
  values: number[];
  highlightIndex: number;
  highlightLabel: string;
};

export function AreaChart({
  values,
  highlightIndex,
  highlightLabel,
}: AreaChartProps) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;

  return (
    <View style={styles.area} collapsable={false}>
      {values.map((value, index) => {
        const height = 28 + ((value - min) / span) * 96;
        const active = index === highlightIndex;
        return (
          <View
            key={index}
            style={[styles.col, {height}]}
            collapsable={false}>
            {active ? (
              <View style={styles.tip}>
                <AppText variant="caption" color={colors.onInk} numberOfLines={1}>
                  {highlightLabel}
                </AppText>
              </View>
            ) : null}
            <View
              style={[
                styles.fill,
                active && styles.fillActive,
              ]}
            />
          </View>
        );
      })}
    </View>
  );
}

type DonutChartProps = {
  slices: SpendSlice[];
  size?: number;
  children?: React.ReactNode;
};

const TICKS = 48;

export function DonutChart({slices, size = 132, children}: DonutChartProps) {
  const ticks: string[] = [];
  slices.forEach(slice => {
    const count = Math.max(1, Math.round((slice.percent / 100) * TICKS));
    for (let i = 0; i < count; i += 1) {
      ticks.push(slice.color);
    }
  });
  while (ticks.length < TICKS) {
    ticks.push(slices[slices.length - 1]?.color ?? colors.inkMuted);
  }
  if (ticks.length > TICKS) {
    ticks.length = TICKS;
  }

  const stroke = 16;
  const tickW = 5;
  const radius = size / 2 - stroke / 2;

  return (
    <View style={{width: size, height: size}} collapsable={false}>
      {ticks.map((color, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: size / 2 - tickW / 2,
            top: size / 2 - stroke / 2,
            width: tickW,
            height: stroke,
            borderRadius: 2,
            backgroundColor: color,
            transform: [
              {rotate: `${(index / TICKS) * 360}deg`},
              {translateY: -radius},
            ],
          }}
        />
      ))}
      <View
        style={[
          styles.donutHole,
          {
            width: size - stroke * 2 - 4,
            height: size - stroke * 2 - 4,
            borderRadius: size,
            top: stroke + 2,
            left: stroke + 2,
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

type ScoreGaugeProps = {
  score: number;
  size?: number;
};

export function ScoreGauge({score, size = 88}: ScoreGaugeProps) {
  const ticks = 40;
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * ticks);
  const stroke = 8;
  const tickW = 4;
  const radius = size / 2 - stroke / 2;

  return (
    <View style={{width: size, height: size}} collapsable={false}>
      {Array.from({length: ticks}, (_, index) => (
        <View
          key={index}
          style={{
            position: 'absolute',
            left: size / 2 - tickW / 2,
            top: size / 2 - stroke / 2,
            width: tickW,
            height: stroke,
            borderRadius: 2,
            backgroundColor:
              index < filled ? colors.positive : colors.canvasSunk,
            transform: [
              {rotate: `${(index / ticks) * 360}deg`},
              {translateY: -radius},
            ],
          }}
        />
      ))}
      <View
        style={[
          styles.scoreHole,
          {
            width: size - 28,
            height: size - 28,
            borderRadius: size,
            top: 14,
            left: 14,
          },
        ]}>
        <AppText variant="title">{score}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  area: {
    height: 176,
    paddingTop: 32,
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  col: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  fill: {
    flex: 1,
    backgroundColor: colors.accentSoft,
    borderTopWidth: 2.5,
    borderTopColor: colors.accent,
  },
  fillActive: {
    backgroundColor: '#F3D7A3',
    borderTopColor: colors.accentPress,
  },
  tip: {
    position: 'absolute',
    top: -28,
    width: 92,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
  },
  donutHole: {
    position: 'absolute',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scoreHole: {
    position: 'absolute',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
