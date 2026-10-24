import React, {useEffect, useRef, useState} from 'react';
import {Animated, StyleSheet, View} from 'react-native';
import LottieView from 'lottie-react-native';

import {colors, duration, easing} from '../../theme';

const MARK_SIZE = 200;

type LaunchSplashProps = {
  /** Startup work is done; the splash may leave once the mark has played. */
  ready: boolean;
  onDone: () => void;
};

/** Animated Paisa mark shown over the app while it boots. */
export function LaunchSplash({ready, onDone}: LaunchSplashProps) {
  const [played, setPlayed] = useState(false);
  const exit = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!played || !ready) {
      return;
    }
    Animated.timing(exit, {
      toValue: 0,
      duration: duration.overlay,
      easing: easing.out,
      useNativeDriver: true,
    }).start(() => onDone());
  }, [played, ready, exit, onDone]);

  return (
    <Animated.View
      style={[styles.root, {opacity: exit}]}
      accessibilityRole="image"
      accessibilityLabel="Paisa">
      <View style={styles.center}>
        <LottieView
          source={require('../../../assets/animations/paisa-splash.json')}
          autoPlay
          loop={false}
          resizeMode="contain"
          style={styles.mark}
          onAnimationFinish={() => setPlayed(true)}
          onAnimationFailure={() => setPlayed(true)}
        />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.ground,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    width: MARK_SIZE,
    height: MARK_SIZE,
  },
});
