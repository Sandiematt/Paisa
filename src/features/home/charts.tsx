/* Size-driven geometry; StyleSheet cannot take the `size` argument. */
/* eslint-disable react-native/no-inline-styles */
import React, {useMemo, useState} from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';

import {AppText} from '../../components/ui';
import {colors, radii, spacing} from '../../theme';
import {HealthTone, SpendSlice} from './homeReport';

const DRAW_H = 120;
const TOP_PAD = 36;
const X_AXIS_H = 24;
const STROKE = 2.5;

type AreaChartProps = {
  values: number[];
  highlightIndex: number;
  highlightLabel: string;
  xLabels?: string[];
};

export function AreaChart({
  values,
  highlightIndex,
  highlightLabel,
  xLabels,
}: AreaChartProps) {
  const [width, setWidth] = useState(0);
  const n = Math.max(values.length, 1);
  const safeValues = values.length > 0 ? values : [0];
  const max = Math.max(0, ...safeValues);
  const min = Math.min(0, ...safeValues);
  const span = max - min || 1;
  const norm = safeValues.map(value => (value - min) / span);
  const baseline = (0 - min) / span;
  const active = Math.min(Math.max(highlightIndex, 0), n - 1);

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  };

  const points = useMemo(() => {
    if (width <= 0) {
      return [];
    }
    const inset = 12;
    const inner = Math.max(width - inset * 2, 1);
    return norm.map((value, index) => ({
      x: inset + (n === 1 ? inner / 2 : (index / (n - 1)) * inner),
      y: TOP_PAD + DRAW_H - value * DRAW_H,
    }));
  }, [n, norm, width]);

  const baselineY = TOP_PAD + DRAW_H - baseline * DRAW_H;

  return (
    <View style={styles.areaWrapper} onLayout={onLayout} collapsable={false}>
      {width > 0 && points.length > 0 ? (
        <View style={{height: TOP_PAD + DRAW_H}} collapsable={false}>
          {points.slice(0, -1).map((point, index) => {
            const next = points[index + 1];
            const top = Math.min(point.y, next.y, baselineY);
            const bottom = Math.max(point.y, next.y, baselineY);
            return (
              <View
                key={`fill-${index}`}
                style={{
                  position: 'absolute',
                  left: point.x,
                  width: Math.max(next.x - point.x, 1),
                  top,
                  height: Math.max(bottom - top, 0),
                  backgroundColor: colors.accentSoft,
                }}
              />
            );
          })}

          {points.slice(0, -1).map((point, index) => {
            const next = points[index + 1];
            const dx = next.x - point.x;
            const dy = next.y - point.y;
            const length = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            return (
              <View
                key={`line-${index}`}
                style={{
                  position: 'absolute',
                  left: (point.x + next.x) / 2 - length / 2,
                  top: (point.y + next.y) / 2 - STROKE / 2,
                  width: length,
                  height: STROKE,
                  borderRadius: 2,
                  backgroundColor: colors.accent,
                  transform: [{rotate: `${angle}deg`}],
                }}
              />
            );
          })}

          <View
            style={{
              position: 'absolute',
              left: points[active].x,
              top: TOP_PAD,
              width: 1.5,
              height: DRAW_H,
              marginLeft: -0.75,
              backgroundColor: colors.accentPress,
              opacity: 0.35,
            }}
          />

          {points.map((point, index) => {
            if (index !== 0 && index !== active && index !== n - 1) {
              return null;
            }
            const isActive = index === active;
            const size = isActive ? 11 : 6;
            return (
              <View
                key={`dot-${index}`}
                style={{
                  position: 'absolute',
                  left: point.x - size / 2,
                  top: point.y - size / 2,
                  width: size,
                  height: size,
                  borderRadius: 999,
                  backgroundColor: isActive ? colors.accentPress : colors.accent,
                  borderWidth: isActive ? 2.5 : 1.5,
                  borderColor: colors.surface,
                  zIndex: 10,
                }}
              />
            );
          })}

          <View
            style={[
              styles.tip,
              {
                left: Math.min(
                  Math.max(points[active].x - 70, 0),
                  Math.max(width - 140, 0),
                ),
                top: Math.max(points[active].y - 34, 0),
              },
            ]}>
            <AppText variant="caption" color={colors.onInk} numberOfLines={1}>
              {highlightLabel}
            </AppText>
          </View>
        </View>
      ) : (
        <View style={{height: TOP_PAD + DRAW_H}} />
      )}

      {xLabels && xLabels.length === n ? (
        <View style={{flexDirection: 'row', height: X_AXIS_H, marginTop: 4}}>
          {xLabels.map((label, index) => (
            <View key={`xlabel-${index}`} style={{flex: 1, alignItems: 'center'}}>
              {(n <= 8 ||
                index === 0 ||
                index === n - 1 ||
                index === active) && (
                <AppText
                  variant="caption"
                  color={
                    index === active ? colors.accentPress : colors.inkMuted
                  }
                  numberOfLines={1}>
                  {label}
                </AppText>
              )}
            </View>
          ))}
        </View>
      ) : null}
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

  const stroke = 22;
  const tickW = 5;
  const radius = size / 2 - stroke / 2;

  return (
    <View style={{width: size, height: size}} collapsable={false}>
      {ticks.map((color, index) => (
        <View
          key={`donut-tick-${index}`}
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

// ---------------------------------------------------------------------------
// ScoreGauge
// ---------------------------------------------------------------------------

type ScoreGaugeProps = {
  score: number;
  size?: number;
  tone?: HealthTone;
};

const GAUGE_COLOR: Record<HealthTone, string> = {
  good: colors.positive,
  fair: colors.accent,
  poor: colors.danger,
  empty: colors.inkMuted,
};

export function ScoreGauge({score, size = 88, tone = 'good'}: ScoreGaugeProps) {
  const ticks = 40;
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * ticks);
  const stroke = 8;
  const tickW = 4;
  const radius = size / 2 - stroke / 2;

  return (
    <View style={{width: size, height: size}} collapsable={false}>
      {Array.from({length: ticks}, (_, index) => (
        <View
          key={`gauge-tick-${index}`}
          style={{
            position: 'absolute',
            left: size / 2 - tickW / 2,
            top: size / 2 - stroke / 2,
            width: tickW,
            height: stroke,
            borderRadius: 2,
            backgroundColor:
              index < filled ? GAUGE_COLOR[tone] : colors.canvasSunk,
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
  areaWrapper: {
    overflow: 'visible',
  },
  tip: {
    position: 'absolute',
    minWidth: 108,
    maxWidth: 140,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.ink,
    alignItems: 'center',
    zIndex: 20,
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
