import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

import {colors} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';

const DOT_COUNT = 3;
const DOT_SIZE = 7;
const BOUNCE_HEIGHT = 4;
const CYCLE_MS = 900;
const STAGGER_MS = 140;

function Dot({delay, reducedMotion}: {delay: number; reducedMotion: boolean}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(progress, {
          toValue: 1,
          duration: CYCLE_MS / 2,
          useNativeDriver: true,
        }),
        Animated.timing(progress, {
          toValue: 0,
          duration: CYCLE_MS / 2,
          useNativeDriver: true,
        }),
        Animated.delay(Math.max(0, (DOT_COUNT - 1) * STAGGER_MS - delay)),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [delay, progress, reducedMotion]);

  if (reducedMotion) {
    return <View style={[styles.dot, styles.dotStatic]} />;
  }

  const translateY = progress.interpolate({inputRange: [0, 1], outputRange: [0, -BOUNCE_HEIGHT]});
  const opacity = progress.interpolate({inputRange: [0, 1], outputRange: [0.35, 0.9]});

  return <Animated.View style={[styles.dot, {opacity, transform: [{translateY}]}]} />;
}

/** Three-dot "typing…" indicator shown in an AI chat bubble while a reply is loading. */
export function TypingIndicator() {
  const reducedMotion = useReducedMotion();

  return (
    <View style={styles.row} accessibilityLabel="Paisa is typing" accessibilityRole="progressbar">
      {Array.from({length: DOT_COUNT}).map((_, index) => (
        <Dot key={index} delay={index * STAGGER_MS} reducedMotion={reducedMotion} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 2,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: colors.inkMuted,
  },
  dotStatic: {
    opacity: 0.55,
  },
});
