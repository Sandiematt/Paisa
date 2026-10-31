import React, {useMemo, useState} from 'react';
import {LayoutChangeEvent, Text, View} from 'react-native';
import Svg, {ClipPath, Defs, G, Line, LinearGradient, Rect, Stop} from 'react-native-svg';

import {formatMoney} from '../../lib/formatMoney';
import {colors, fonts, gradients, makeStyles, useTheme, withAlpha} from '../../theme';
import {compactNumber, type SpendingBar} from './insightsMath';

const CHART_HEIGHT = 120;
const HEADROOM = 16;
const MIN_BAR = 6;
const STRIPE_GAP = 8;

type SpendingBarsProps = {
  bars: SpendingBar[];
  /** Reference line value, or null for none. */
  pace: number | null;
  currencySymbol: string;
  /** Spoken name of one bar ("week", "day", "month"). */
  bucketNoun: string;
};

function barWidthFor(count: number, slot: number): number {
  if (count <= 5) return slot * 0.78;
  if (count <= 7) return slot * 0.64;
  return slot * 0.6;
}

/**
 * Rounded gradient bars with a dashed pace line. Finished bars use the primary
 * gradient, bars over the budget pace use the rose gradient, and the running
 * bucket is hatched (violet on `wash` in light). Captions are laid out as flex columns so they line up with
 * the SVG slots at any width.
 */
export function SpendingBars({bars, pace, currencySymbol, bucketNoun}: SpendingBarsProps) {
  const styles = useStyles();
  const {scheme} = useTheme();
  const light = scheme === 'light';
  const [width, setWidth] = useState(0);
  const count = bars.length;
  const slot = count > 0 ? width / count : 0;
  const barWidth = barWidthFor(count, slot);
  const radius = Math.min(16, barWidth / 2);

  const maxValue = useMemo(() => Math.max(1, pace ?? 0, ...bars.map(bar => bar.amount)), [bars, pace]);
  const scale = (CHART_HEIGHT - HEADROOM) / maxValue;

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);

  const money = (value: number) => formatMoney(value, currencySymbol, {decimals: 0});
  const showAmounts = count <= 7;
  const amountText = (value: number) => (count <= 5 ? money(value) : `${currencySymbol}${compactNumber(value)}`);

  const spoken = bars
    .map(bar => {
      const note = bar.state === 'over' ? ', over pace' : bar.state === 'current' ? ', in progress' : '';
      return `${bar.label} ${money(bar.amount)}${note}`;
    })
    .join('; ');

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Spending by ${bucketNoun}: ${spoken}`}>
      <View style={styles.chart} onLayout={onLayout} importantForAccessibility="no-hide-descendants">
        {width > 0 ? (
          <Svg width={width} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="insightsBar" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={gradients.primary[0]} />
                <Stop offset="1" stopColor={colors.indigo} />
              </LinearGradient>
              <LinearGradient id="insightsBarHot" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={gradients.rose[0]} />
                <Stop offset="1" stopColor={gradients.rose[1]} />
              </LinearGradient>
              {bars.map((bar, index) => {
                if (bar.state !== 'current') return null;
                const h = Math.max(MIN_BAR, bar.amount * scale);
                return (
                  <ClipPath key={`clip-${index}`} id={`insightsClip${index}`}>
                    <Rect
                      x={index * slot + (slot - barWidth) / 2}
                      y={CHART_HEIGHT - h}
                      width={barWidth}
                      height={h}
                      rx={radius}
                    />
                  </ClipPath>
                );
              })}
            </Defs>

            {bars.map((bar, index) => {
              const h = Math.max(MIN_BAR, bar.amount * scale);
              const x = index * slot + (slot - barWidth) / 2;
              const y = CHART_HEIGHT - h;

              if (bar.state === 'current') {
                const lines: React.ReactElement[] = [];
                for (let offset = -h; offset < barWidth; offset += STRIPE_GAP) {
                  lines.push(
                    <Line
                      key={offset}
                      x1={x + offset}
                      y1={CHART_HEIGHT}
                      x2={x + offset + h}
                      y2={y}
                      stroke={light ? colors.violet : colors.lavender}
                      strokeOpacity={0.7}
                      strokeWidth={2}
                    />,
                  );
                }
                return (
                  <G key={`bar-${index}`} clipPath={`url(#insightsClip${index})`}>
                    <Rect x={x} y={y} width={barWidth} height={h} fill={light ? colors.wash : withAlpha(colors.violet, 0.18)} />
                    {lines}
                  </G>
                );
              }

              return (
                <Rect
                  key={`bar-${index}`}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={h}
                  rx={radius}
                  fill={bar.state === 'over' ? 'url(#insightsBarHot)' : 'url(#insightsBar)'}
                  opacity={bar.amount > 0 ? 1 : 0.35}
                />
              );
            })}

            {pace !== null ? (
              <Line
                x1={0}
                y1={CHART_HEIGHT - pace * scale}
                x2={width}
                y2={CHART_HEIGHT - pace * scale}
                stroke={colors.text}
                strokeOpacity={0.35}
                strokeDasharray="4 5"
              />
            ) : null}
          </Svg>
        ) : null}
      </View>

      <View style={styles.labels}>
        {bars.map((bar, index) => (
          <View key={`label-${index}`} style={styles.labelCol}>
            {showAmounts ? (
              <Text style={[styles.amount, count > 5 ? styles.amountSmall : null]} numberOfLines={1}>
                {amountText(bar.amount)}
              </Text>
            ) : null}
            <Text style={[styles.caption, count > 7 ? styles.captionTiny : null]} numberOfLines={1}>
              {bar.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  chart: {
    height: CHART_HEIGHT,
  },
  labels: {
    flexDirection: 'row',
    marginTop: 12,
  },
  labelCol: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  amount: {
    fontFamily: fonts.jakartaBold,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  amountSmall: {
    fontSize: 11,
    lineHeight: 16,
  },
  caption: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 12,
    lineHeight: 16,
    color: colors.muted,
  },
  captionTiny: {
    fontSize: 10,
    lineHeight: 14,
  },
}));
