import React, {useRef} from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Stop} from 'react-native-svg';

import {GradientKey, colors, gradients} from '../../theme';

type ProgressRingProps = {
  /** Outer diameter. Budget/savings rings are 112; avatar ring is 46. */
  size?: number;
  /** Ring thickness. 10 for cards, 3 for the avatar ring. */
  stroke?: number;
  /** 0 to 1. Clamped. */
  progress: number;
  /** Named gradient for the arc. Default `'primary'`. */
  gradient?: GradientKey;
  /** Track colour. Default `#FFFFFF14` (`colors.line`). */
  trackColor?: string;
  /** Rendered in the middle, e.g. a percentage and a caption. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

let ringSeq = 0;

/**
 * SVG progress ring: dim track, round-capped gradient arc starting at 12
 * o'clock. Centre content goes in `children`.
 *
 *   <ProgressRing size={112} stroke={10} progress={0.81} gradient="primary">
 *     <AppText variant="title">81%</AppText>
 *   </ProgressRing>
 */
export function ProgressRing({
  size = 112,
  stroke = 10,
  progress,
  gradient = 'primary',
  trackColor = colors.line,
  children,
  style,
  accessibilityLabel,
}: ProgressRingProps) {
  const idRef = useRef<string | null>(null);
  if (idRef.current == null) {
    ringSeq += 1;
    idRef.current = `dxRing${ringSeq}`;
  }
  const id = idRef.current;

  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const stops = gradients[gradient];

  return (
    <View
      style={[{width: size, height: size}, style]}
      accessible={accessibilityLabel != null}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{min: 0, max: 100, now: Math.round(clamped * 100)}}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {stops.map((stop, index) => (
              <Stop
                key={`${stop}-${index}`}
                offset={index / Math.max(stops.length - 1, 1)}
                stopColor={stop}
              />
            ))}
          </LinearGradient>
        </Defs>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {clamped > 0 ? (
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference * clamped} ${circumference}`}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
