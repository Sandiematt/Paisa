import {Moon, Sun} from 'phosphor-react-native';
import React, {useEffect, useRef} from 'react';
import {Animated, Easing, GestureResponderEvent, StyleSheet} from 'react-native';

import {useReducedMotion} from '../../hooks/useReducedMotion';
import {REVEAL_MS, palettes, useTheme} from '../../theme';
import {PressableScale} from './PressableScale';

type ThemeToggleProps = {
  size?: number;
};

/** 0 shows the sun (dark scheme), 1 the moon (light scheme). */
const target = (scheme: 'dark' | 'light') => (scheme === 'light' ? 1 : 0);

/**
 * Sun / moon switch. The tap point seeds the Telegram-style circular reveal
 * in `ThemeProvider`, which opens on this icon, so the swap plays inside the
 * growing circle: the outgoing glyph turns away and fades while the incoming
 * one turns in. One value drives both and always settles on 0 or 1, so the
 * icon ends in its resting pose. Shows the scheme you would switch TO.
 */
export function ThemeToggle({size = 20}: ThemeToggleProps) {
  const {scheme, toggle} = useTheme();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(target(scheme))).current;

  useEffect(() => {
    const to = target(scheme);
    if (reducedMotion) {
      progress.setValue(to);
      return;
    }
    const animation = Animated.timing(progress, {
      toValue: to,
      duration: REVEAL_MS,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [progress, reducedMotion, scheme]);

  const onPress = (event: GestureResponderEvent) => {
    toggle(event.nativeEvent.pageX, event.nativeEvent.pageY, !reducedMotion);
  };

  const sun = {
    opacity: progress.interpolate({inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp'}),
    transform: [
      {rotate: progress.interpolate({inputRange: [0, 1], outputRange: ['0deg', '90deg']})},
      {scale: progress.interpolate({inputRange: [0, 1], outputRange: [1, 0.5]})},
    ],
  };
  const moon = {
    opacity: progress.interpolate({inputRange: [0.4, 1], outputRange: [0, 1], extrapolate: 'clamp'}),
    transform: [
      {rotate: progress.interpolate({inputRange: [0, 1], outputRange: ['-90deg', '0deg']})},
      {scale: progress.interpolate({inputRange: [0, 1], outputRange: [0.5, 1]})},
    ],
  };

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.88}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityState={{checked: scheme === 'dark'}}
      accessibilityLabel="Dark mode"
      style={{width: size, height: size}}>
      <Animated.View style={[StyleSheet.absoluteFill, sun]}>
        <Sun size={size} color={palettes.dark.gold} weight="fill" />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, moon]}>
        <Moon size={size} color={palettes.light.indigo} weight="fill" />
      </Animated.View>
    </PressableScale>
  );
}
