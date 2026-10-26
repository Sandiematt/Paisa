/* Size-driven geometry; StyleSheet cannot take the `size` argument. */
/* eslint-disable react-native/no-inline-styles */
import React, {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Animated, LayoutChangeEvent, StyleSheet, View} from 'react-native';
import Svg, {Defs, LinearGradient, Path, Stop} from 'react-native-svg';

import {AppText} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {colors, dataReveal, easing, spring} from '../../theme';
import {HealthTone, SpendSlice} from './homeReport';

type AreaChartProps = {
  values: number[];
  height?: number;
  accessibilityLabel?: string;
};

type Point = {x: number; y: number};

const CHART_PAD_TOP = 8;
const CHART_PAD_BOTTOM = 6;
const CHART_PAD_RIGHT = 6;
const END_DOT = 5;

let chartSeq = 0;

/** Series already drawn once; coming back to them should not redraw. */
const drawnSeries = new Set<string>();

/** Smooth line through the points; control points stay between neighbours so
 *  the curve never overshoots a peak or dips below a valley. */
function smoothPath(points: Point[]): string {
  if (points.length === 0) {
    return '';
  }
  let d = `M${points[0].x.toFixed(2)} ${points[0].y.toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const lo = Math.min(p1.y, p2.y);
    const hi = Math.max(p1.y, p2.y);
    const c1y = Math.min(hi, Math.max(lo, p1.y + (p2.y - p0.y) / 6));
    const c2y = Math.min(hi, Math.max(lo, p2.y - (p3.y - p1.y) / 6));
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    d += ` C${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(
      2,
    )} ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/**
 * DX balance spotlight chart: violet area fill, a soft glow under a
 * lavender-violet line and a white dot on the latest value. Fills the width
 * it is given.
 *
 * New data draws in left to right, then the latest-value dot pops and sends
 * out one ripple. The wipe is two views sliding against each other (the
 * window moves right while the chart inside moves left by the same amount),
 * so the whole reveal runs on the native driver without touching the SVG.
 */
export function AreaChart({values, height = 92, accessibilityLabel}: AreaChartProps) {
  const reducedMotion = useReducedMotion();
  const [width, setWidth] = useState(0);
  const signature = values.join(',');
  const seen = drawnSeries.has(signature) ? 1 : 0;
  const wipe = useRef(new Animated.Value(seen)).current;
  const dot = useRef(new Animated.Value(seen)).current;
  const ripple = useRef(new Animated.Value(1)).current;
  const idRef = useRef<string | null>(null);
  if (idRef.current == null) {
    chartSeq += 1;
    idRef.current = `dxChart${chartSeq}`;
  }
  const id = idRef.current;

  const onLayout = (event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  };

  const {line, area, last} = useMemo(() => {
    const safe = values.length > 0 ? values : [0];
    const max = Math.max(...safe);
    const min = Math.min(...safe);
    const span = max - min;
    const drawW = Math.max(width - CHART_PAD_RIGHT, 1);
    const drawH = height - CHART_PAD_TOP - CHART_PAD_BOTTOM;
    const toY = (value: number) =>
      span === 0
        ? CHART_PAD_TOP + drawH / 2
        : CHART_PAD_TOP + (1 - (value - min) / span) * drawH;
    // One point (first day of the period) is drawn as a flat line.
    const source = safe.length === 1 ? [safe[0], safe[0]] : safe;
    const pts: Point[] = source.map((value, index) => ({
      x: (index / (source.length - 1)) * drawW,
      y: toY(value),
    }));
    const path = smoothPath(pts);
    return {
      line: path,
      area: `${path} L${drawW.toFixed(2)} ${height} L0 ${height} Z`,
      last: pts[pts.length - 1],
    };
  }, [height, values, width]);

  // Layout effect: new data must be hidden before its first paint, or the
  // finished chart flashes for a frame before the wipe starts.
  useLayoutEffect(() => {
    if (width === 0) {
      return;
    }
    if (reducedMotion || drawnSeries.has(signature)) {
      wipe.setValue(1);
      dot.setValue(1);
      ripple.setValue(1);
      return;
    }
    drawnSeries.add(signature);
    wipe.setValue(0);
    dot.setValue(0);
    ripple.setValue(0);
    const reveal = Animated.sequence([
      Animated.timing(wipe, {
        toValue: 1,
        duration: dataReveal.chart,
        easing: easing.screen,
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.spring(dot, {toValue: 1, ...spring.pop, useNativeDriver: true}),
        Animated.timing(ripple, {
          toValue: 1,
          duration: 700,
          easing: easing.out,
          useNativeDriver: true,
        }),
      ]),
    ]);
    reveal.start();
    return () => reveal.stop();
  }, [dot, reducedMotion, ripple, signature, wipe, width]);

  const windowX = wipe.interpolate({inputRange: [0, 1], outputRange: [-width, 0]});
  const contentX = wipe.interpolate({inputRange: [0, 1], outputRange: [width, 0]});
  const dotBox = {
    left: last.x - END_DOT,
    top: last.y - END_DOT,
    width: END_DOT * 2,
    height: END_DOT * 2,
    borderRadius: END_DOT,
  };

  return (
    <View
      style={{height}}
      onLayout={onLayout}
      collapsable={false}
      accessible={accessibilityLabel != null}
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}>
      {width > 0 ? (
        <Animated.View style={[styles.wipe, {transform: [{translateX: windowX}]}]}>
          <Animated.View style={{transform: [{translateX: contentX}]}}>
            <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
              <Defs>
                <LinearGradient id={`${id}Fill`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.violet} stopOpacity={0.45} />
                  <Stop offset="1" stopColor={colors.violet} stopOpacity={0} />
                </LinearGradient>
                <LinearGradient id={`${id}Stroke`} x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={colors.violet} />
                  <Stop offset="1" stopColor={colors.lavender} />
                </LinearGradient>
              </Defs>
              <Path d={area} fill={`url(#${id}Fill)`} />
              {/* Glow: wide, low-opacity strokes stand in for a blur filter. */}
              <Path
                d={line}
                fill="none"
                stroke={colors.orb}
                strokeWidth={12}
                strokeOpacity={0.1}
                strokeLinecap="round"
              />
              <Path
                d={line}
                fill="none"
                stroke={colors.orb}
                strokeWidth={7}
                strokeOpacity={0.22}
                strokeLinecap="round"
              />
              <Path
                d={line}
                fill="none"
                stroke={`url(#${id}Stroke)`}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        </Animated.View>
      ) : null}
      {width > 0 ? (
        <>
          <Animated.View
            pointerEvents="none"
            style={[
              styles.endDot,
              styles.endRipple,
              dotBox,
              {
                opacity: ripple.interpolate({inputRange: [0, 1], outputRange: [0.55, 0]}),
                transform: [{scale: ripple.interpolate({inputRange: [0, 1], outputRange: [1, 3.2]})}],
              },
            ]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.endDot, dotBox, {transform: [{scale: dot}]}]}
          />
        </>
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
    ticks.push(slices[slices.length - 1]?.color ?? colors.muted);
  }
  if (ticks.length > TICKS) {
    ticks.length = TICKS;
  }

  const hole = Math.round(size * 0.71);
  const stroke = Math.max(10, (size - hole) / 2);
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
            width: hole,
            height: hole,
            borderRadius: hole,
            top: (size - hole) / 2,
            left: (size - hole) / 2,
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
  good: colors.mint,
  fair: colors.violet,
  poor: colors.roseLight,
  empty: colors.muted,
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
              index < filled ? GAUGE_COLOR[tone] : colors.line,
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
  wipe: {
    overflow: 'hidden',
  },
  endDot: {
    position: 'absolute',
    backgroundColor: colors.text,
  },
  endRipple: {
    backgroundColor: colors.lavender,
  },
  donutHole: {
    position: 'absolute',
    backgroundColor: colors.ground,
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
