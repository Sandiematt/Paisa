import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import {Receipt} from 'phosphor-react-native';

import {GradientIconSquare} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {colors, duration, easing} from '../../theme';

const SIZE = 48;
const FLOAT = 5;
const DRIFT_MS = 2200;

/**
 * Empty-state receipt that drifts gently above its own shadow. The bob is a
 * native-driver loop, so it costs the JS thread nothing while it idles; with
 * reduced motion it simply sits still.
 */
export function FloatingReceipt() {
  const reducedMotion = useReducedMotion();
  const enter = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const drift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reducedMotion) {
      enter.setValue(1);
      drift.setValue(0);
      return;
    }
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {toValue: 1, duration: DRIFT_MS, easing: easing.inOut, useNativeDriver: true}),
        Animated.timing(drift, {toValue: 0, duration: DRIFT_MS, easing: easing.inOut, useNativeDriver: true}),
      ]),
    );
    const arrive = Animated.timing(enter, {
      toValue: 1,
      duration: duration.overlay,
      easing: easing.out,
      useNativeDriver: true,
    });
    arrive.start(() => float.start());
    return () => {
      arrive.stop();
      float.stop();
    };
  }, [drift, enter, reducedMotion]);

  const lift = drift.interpolate({inputRange: [0, 1], outputRange: [0, -FLOAT]});
  const tilt = drift.interpolate({inputRange: [0, 1], outputRange: ['-4deg', '3deg']});
  const rise = enter.interpolate({inputRange: [0, 1], outputRange: [14, 0]});

  return (
    <Animated.View
      style={[styles.root, {opacity: enter, transform: [{translateY: rise}]}]}
      importantForAccessibility="no-hide-descendants">
      <Animated.View style={{transform: [{translateY: lift}, {rotate: tilt}]}}>
        <GradientIconSquare size={SIZE} glow>
          <Receipt size={24} color={colors.text} weight="fill" />
        </GradientIconSquare>
      </Animated.View>
      <Animated.View
        style={[
          styles.shadow,
          {
            opacity: drift.interpolate({inputRange: [0, 1], outputRange: [0.5, 0.28]}),
            transform: [{scaleX: drift.interpolate({inputRange: [0, 1], outputRange: [1, 0.8]})}],
          },
        ]}
      />
      <View style={styles.spacer} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
  },
  shadow: {
    marginTop: 8,
    width: SIZE * 0.7,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.violet,
  },
  spacer: {
    height: 2,
  },
});
