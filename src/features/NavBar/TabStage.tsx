import React, {useLayoutEffect, useRef} from 'react';
import {Animated, StyleProp, ViewStyle} from 'react-native';

import {useReducedMotion} from '../../hooks/useReducedMotion';
import {duration, easing} from '../../theme';
import {TABS, TabId} from './NavBar';

type TabStageProps = {
  tab: TabId;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/** Short drift: a tab switch is a glance sideways, not a page turn. */
const DRIFT = 18;

/**
 * Brings each tab in with a quick fade and a short drift from the side of the
 * tab it came from. Only the arriving page animates; the old one is gone at
 * once, so a switch never keeps two screens mounted.
 */
export function TabStage({tab, style, children}: TabStageProps) {
  const reducedMotion = useReducedMotion();
  const enter = useRef(new Animated.Value(1)).current;
  const shift = useRef(new Animated.Value(0)).current;
  const previous = useRef(tab);

  // Layout effect: the new page has to be parked before its first paint.
  useLayoutEffect(() => {
    if (tab === previous.current) {
      // Re-run for a settings change: never leave a page half faded.
      enter.setValue(1);
      shift.setValue(0);
      return;
    }
    const direction = TABS.indexOf(tab) > TABS.indexOf(previous.current) ? 1 : -1;
    previous.current = tab;
    if (reducedMotion) {
      enter.setValue(1);
      shift.setValue(0);
      return;
    }
    enter.setValue(0);
    shift.setValue(DRIFT * direction);
    const settle = {duration: duration.enter, easing: easing.out, useNativeDriver: true};
    const anim = Animated.parallel([
      Animated.timing(enter, {toValue: 1, ...settle}),
      Animated.timing(shift, {toValue: 0, ...settle}),
    ]);
    anim.start();
    return () => anim.stop();
  }, [enter, reducedMotion, shift, tab]);

  return (
    <Animated.View
      collapsable={false}
      style={[style, {opacity: enter, transform: [{translateX: shift}]}]}>
      {children}
    </Animated.View>
  );
}
