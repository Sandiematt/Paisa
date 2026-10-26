import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, Animated, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import Svg, {Path} from 'react-native-svg';

import {AppText} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {colors, duration, easing, radii, shadows, spring} from '../../theme';

export type SavedEvent = {
  /** Bumps on every save so the same toast can replay. */
  key: number;
  title: string;
  detail: string;
  tone: 'income' | 'expense';
};

type SavedToastProps = {
  event: SavedEvent | null;
};

const BADGE = 30;
const CHECK = 'M9 15.5l4 4 8-9';
const CHECK_LENGTH = 20;
/** Let the composer's modal finish sliding away before the toast lands. */
const ENTER_DELAY = 260;
const HOLD_MS = 1700;

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Confirms a saved transaction: a pill drops in from the top, the badge pops,
 * a check draws itself and one ripple goes out, then the pill tucks away. It
 * never takes touches, so nothing waits on it.
 */
export function SavedToast({event}: SavedToastProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const show = useRef(new Animated.Value(0)).current;
  const badge = useRef(new Animated.Value(0)).current;
  const check = useRef(new Animated.Value(0)).current;
  const ripple = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!event) {
      return;
    }
    AccessibilityInfo.announceForAccessibility(`${event.title}. ${event.detail}`);

    show.setValue(0);
    badge.setValue(reducedMotion ? 1 : 0);
    check.setValue(reducedMotion ? 1 : 0);
    ripple.setValue(reducedMotion ? 1 : 0);

    const flourish = reducedMotion
      ? Animated.delay(0)
      : Animated.parallel([
          Animated.spring(badge, {toValue: 1, ...spring.celebrate, useNativeDriver: true}),
          Animated.timing(ripple, {toValue: 1, duration: 620, easing: easing.out, useNativeDriver: true}),
          Animated.sequence([
            Animated.delay(120),
            // SVG stroke props cannot use the native driver; it is 260ms on one path.
            Animated.timing(check, {toValue: 1, duration: 260, easing: easing.out, useNativeDriver: false}),
          ]),
        ]);

    const run = Animated.sequence([
      Animated.delay(ENTER_DELAY),
      Animated.parallel([
        Animated.timing(show, {toValue: 1, duration: duration.overlay, easing: easing.out, useNativeDriver: true}),
        flourish,
      ]),
      Animated.delay(HOLD_MS),
      Animated.timing(show, {toValue: 0, duration: duration.enter, easing: easing.screen, useNativeDriver: true}),
    ]);
    run.start();
    return () => run.stop();
    // Replays per save; the values are refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.key, reducedMotion]);

  if (!event) {
    return null;
  }

  const tint = event.tone === 'income' ? colors.mint : colors.violet;

  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.dock,
        {top: insets.top + 8},
        {
          opacity: show,
          transform: [
            {translateY: show.interpolate({inputRange: [0, 1], outputRange: [reducedMotion ? 0 : -24, 0]})},
            {scale: show.interpolate({inputRange: [0, 1], outputRange: [0.96, 1]})},
          ],
        },
      ]}>
      <View style={[styles.pill, shadows.card]}>
        <View style={styles.badgeWrap}>
          <Animated.View
            style={[
              styles.badge,
              styles.ripple,
              {
                backgroundColor: tint,
                opacity: ripple.interpolate({inputRange: [0, 1], outputRange: [0.45, 0]}),
                transform: [{scale: ripple.interpolate({inputRange: [0, 1], outputRange: [1, 1.9]})}],
              },
            ]}
          />
          <Animated.View style={[styles.badge, {backgroundColor: tint, transform: [{scale: badge}]}]}>
            <Svg width={BADGE} height={BADGE} viewBox="0 0 30 30">
              <AnimatedPath
                d={CHECK}
                fill="none"
                stroke={event.tone === 'income' ? colors.onInk : colors.text}
                strokeWidth={2.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={`${CHECK_LENGTH} ${CHECK_LENGTH}`}
                strokeDashoffset={check.interpolate({inputRange: [0, 1], outputRange: [CHECK_LENGTH, 0]})}
              />
            </Svg>
          </Animated.View>
        </View>
        <View style={styles.text}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {event.title}
          </AppText>
          <AppText variant="caption" color={colors.muted} numberOfLines={1}>
            {event.detail}
          </AppText>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dock: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 30,
    elevation: 30,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    maxWidth: '86%',
    paddingVertical: 10,
    paddingLeft: 10,
    paddingRight: 18,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surfaceRaised,
  },
  badgeWrap: {
    width: BADGE,
    height: BADGE,
  },
  badge: {
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
  },
  text: {
    flexShrink: 1,
  },
});
