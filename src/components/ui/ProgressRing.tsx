import React, {useEffect, useRef} from 'react';
import {Animated, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import Svg, {Circle, Defs, LinearGradient, Stop} from 'react-native-svg';

import {GradientKey, colors, dataReveal, easing, gradients, makeStyles} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ProgressRingProps = {
  /** Outer diameter. Budget/savings rings are 112; avatar ring is 46. */
  size?: number;
  /** Ring thickness. 10 for cards, 3 for the avatar ring. */
  stroke?: number;
  /** 0 to 1. Clamped. */
  progress: number;
  /** Named gradient for the arc. Default `'primary'`. */
  gradient?: GradientKey;
  /** Track colour. Default `colors.line`. */
  trackColor?: string;
  /** Rendered in the middle, e.g. a percentage and a caption. */
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  /** Sweep the arc in from empty on mount and glide between values. */
  animated?: boolean;
};

let ringSeq = 0;

/**
 * SVG progress ring: dim track, round-capped gradient arc starting at 12
 * o'clock. Centre content goes in `children`.
 *
 * The arc sweeps in on mount and glides to each new value. SVG props cannot
 * ride the native driver, but this is one dash offset on one circle for under
 * a second, then the loop is idle.
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
  animated = true,
}: ProgressRingProps) {
  const styles = useStyles();
  const reducedMotion = useReducedMotion();
  const clamped = Math.max(0, Math.min(1, progress));
  const still = !animated || reducedMotion;
  const fill = useRef(new Animated.Value(still ? clamped : 0)).current;

  useEffect(() => {
    if (still) {
      fill.setValue(clamped);
      return;
    }
    const sweep = Animated.timing(fill, {
      toValue: clamped,
      duration: dataReveal.ring,
      easing: easing.out,
      useNativeDriver: false,
    });
    sweep.start();
    return () => sweep.stop();
  }, [clamped, fill, still]);

  const idRef = useRef<string | null>(null);
  if (idRef.current == null) {
    ringSeq += 1;
    idRef.current = `dxRing${ringSeq}`;
  }
  const id = idRef.current;

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
          <AnimatedCircle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={`url(#${id})`}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={fill.interpolate({
              inputRange: [0, 1],
              outputRange: [circumference, 0],
            })}
            // A zero-length dash still draws its round caps as a dot.
            strokeOpacity={fill.interpolate({
              inputRange: [0, 0.01],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            })}
            transform={`rotate(-90 ${center} ${center})`}
          />
        ) : null}
      </Svg>
      {children ? <View style={styles.center}>{children}</View> : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  center: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
