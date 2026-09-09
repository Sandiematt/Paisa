import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

import {colors, duration, easing, radii, spring} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {AppText} from './AppText';

/**
 * Setup-complete marker. This is the one place in the flow with a delight
 * budget: it is seen exactly once per account, so it can afford a settle and
 * a single halo pulse.
 */
export function CelebrationBadge() {
  const reducedMotion = useReducedMotion();
  const badge = useRef(new Animated.Value(reducedMotion ? 1 : 0.9)).current;
  const glyph = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const halo = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      badge.setValue(1);
      glyph.setValue(1);
      return;
    }

    const sequence = Animated.parallel([
      Animated.spring(badge, {
        toValue: 1,
        ...spring.celebrate,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(90),
        Animated.spring(glyph, {
          toValue: 1,
          ...spring.celebrate,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.delay(60),
        Animated.timing(halo, {
          toValue: 1,
          duration: duration.overlay,
          easing: easing.out,
          useNativeDriver: true,
        }),
      ]),
    ]);

    sequence.start();
    return () => sequence.stop();
  }, [badge, glyph, halo, reducedMotion]);

  const haloScale = halo.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.6],
  });
  const haloOpacity = halo.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0],
  });
  const glyphScale = glyph.interpolate({
    inputRange: [0, 1],
    outputRange: [0.85, 1],
  });

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          {opacity: haloOpacity, transform: [{scale: haloScale}]},
        ]}
      />
      <Animated.View style={[styles.badge, {transform: [{scale: badge}]}]}>
        <Animated.View style={{opacity: glyph, transform: [{scale: glyphScale}]}}>
          <AppText variant="title" color={colors.onInk}>
            {'\u2713'}
          </AppText>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const SIZE = 64;

const styles = StyleSheet.create({
  root: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.positive,
  },
  badge: {
    width: SIZE,
    height: SIZE,
    borderRadius: radii.pill,
    backgroundColor: colors.positive,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
