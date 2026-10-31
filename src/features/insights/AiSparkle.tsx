import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {Sparkle} from 'phosphor-react-native/src/icons/Sparkle';

import {useReducedMotion} from '../../hooks/useReducedMotion';
import {brand, colors, easing} from '../../theme';

type AiSparkleProps = {
  size?: number;
};

/** Twinkle length and the rest that follows it. Mostly rest, on purpose. */
const TWINKLE_MS = 700;
const REST_MS = 3200;

/**
 * The AI summary glyph. Every few seconds it gives one soft twinkle while two
 * tiny sparkles blink beside it, then it rests. A single native-driver loop
 * drives all three, so it never wakes the JS thread. It sits on a gradient
 * icon square, so its colours are scheme-independent.
 */
export function AiSparkle({size = 18}: AiSparkleProps) {
  const reducedMotion = useReducedMotion();
  const beat = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      beat.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(beat, {toValue: 1, duration: TWINKLE_MS, easing: easing.inOut, useNativeDriver: true}),
        Animated.delay(REST_MS),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [beat, reducedMotion]);

  const main = {
    transform: [
      {scale: beat.interpolate({inputRange: [0, 0.45, 1], outputRange: [1, 1.18, 1]})},
      {rotate: beat.interpolate({inputRange: [0, 0.45, 1], outputRange: ['0deg', '18deg', '0deg']})},
    ],
  };
  const blink = (from: number, to: number) => ({
    opacity: beat.interpolate({
      inputRange: [0, from, (from + to) / 2, to, 1],
      outputRange: [0, 0, 1, 0, 0],
    }),
    transform: [
      {
        scale: beat.interpolate({
          inputRange: [0, from, (from + to) / 2, to, 1],
          outputRange: [0.4, 0.4, 1, 0.4, 0.4],
        }),
      },
    ],
  });
  const mini = Math.max(6, Math.round(size * 0.42));

  return (
    <View style={{width: size, height: size}}>
      <Animated.View style={main}>
        <Sparkle size={size} color={colors.onAccent} weight="fill" />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.topRight, blink(0.15, 0.6)]}>
        <Sparkle size={mini} color={colors.onAccent} weight="fill" />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.bottomLeft, blink(0.4, 0.9)]}>
        <Sparkle size={mini - 1} color={brand.lavender} weight="fill" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRight: {
    position: 'absolute',
    top: -5,
    right: -6,
  },
  bottomLeft: {
    position: 'absolute',
    bottom: -4,
    left: -6,
  },
});
