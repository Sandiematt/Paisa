import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {PiggyBank} from 'phosphor-react-native';

import {useReducedMotion} from '../../hooks/useReducedMotion';
import {colors, easing, spring} from '../../theme';

type SavingsPiggyProps = {
  /** Amount saved. A coin drops in whenever it lands on a new value. */
  saved: number;
  size?: number;
};

const COIN = 7;

/** The last amount a coin was dropped for, so remounts stay still. */
let lastDropped: number | null = null;

/**
 * Savings card glyph. When the saved amount changes (or is first seen) a gold
 * coin drops into the slot and the piggy gives a small squash. One short beat,
 * native driver only; nothing loops.
 */
export function SavingsPiggy({saved, size = 17}: SavingsPiggyProps) {
  const reducedMotion = useReducedMotion();
  const coin = useRef(new Animated.Value(1)).current;
  const squash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion || saved <= 0 || lastDropped === saved) {
      return;
    }
    lastDropped = saved;
    coin.setValue(0);
    squash.setValue(0);
    const drop = Animated.sequence([
      Animated.delay(420),
      Animated.timing(coin, {
        toValue: 1,
        duration: 420,
        easing: easing.inOut,
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.timing(squash, {toValue: 1, duration: 90, easing: easing.out, useNativeDriver: true}),
        Animated.spring(squash, {toValue: 0, ...spring.pop, useNativeDriver: true}),
      ]),
    ]);
    drop.start();
    return () => drop.stop();
  }, [coin, reducedMotion, saved, squash]);

  return (
    <View style={styles.root}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.coin,
          {
            opacity: coin.interpolate({inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0]}),
            transform: [
              {translateY: coin.interpolate({inputRange: [0, 1], outputRange: [-16, -2]})},
              {scale: coin.interpolate({inputRange: [0, 0.75, 1], outputRange: [1, 1, 0.6]})},
            ],
          },
        ]}
      />
      <Animated.View
        style={{
          transform: [
            {scaleX: squash.interpolate({inputRange: [0, 1], outputRange: [1, 1.12]})},
            {scaleY: squash.interpolate({inputRange: [0, 1], outputRange: [1, 0.86]})},
          ],
        }}>
        <PiggyBank size={size} weight="fill" color={colors.text} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  coin: {
    position: 'absolute',
    top: 0,
    width: COIN,
    height: COIN,
    borderRadius: COIN / 2,
    backgroundColor: colors.gold,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.55)',
  },
});
