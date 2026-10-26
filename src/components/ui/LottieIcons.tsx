import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, View} from 'react-native';
import LottieView from 'lottie-react-native';

import {useReducedMotion} from '../../hooks/useReducedMotion';

const AnimatedLottie = Animated.createAnimatedComponent(LottieView);

/** Artwork sits inside ~2/3 of its canvas, so the player is drawn larger. */
const CANVAS_SCALE = 1.45;

const NAV_SOURCES = {
  home: require('../../../assets/animations/nav-home.json'),
  activity: require('../../../assets/animations/nav-activity.json'),
  insights: require('../../../assets/animations/nav-insights.json'),
} as const;

const TILE_SOURCES = {
  expense: require('../../../assets/animations/tile-expense.json'),
  income: require('../../../assets/animations/tile-income.json'),
  wallet: require('../../../assets/animations/tile-wallet.json'),
  piggy: require('../../../assets/animations/tile-piggy.json'),
  bell: require('../../../assets/animations/tile-bell.json'),
} as const;

export type NavIconId = keyof typeof NAV_SOURCES;
export type TileIconKind = keyof typeof TILE_SOURCES;

type NavLottieIconProps = {
  id: NavIconId;
  active: boolean;
  /** Layout size of the icon slot. */
  size: number;
};

/**
 * Bottom-nav icon. Frame 0 is the resting outline in muted grey and the last
 * frame is the active, filled icon, so selecting a tab plays it forward and
 * leaving plays it back a little faster. A tab that is already active on
 * mount simply starts on its last frame.
 */
export function NavLottieIcon({id, active, size}: NavLottieIconProps) {
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(active ? 1 : 0)).current;
  const wasActive = useRef(active);

  useEffect(() => {
    if (wasActive.current === active) {
      return;
    }
    wasActive.current = active;
    if (reducedMotion) {
      progress.setValue(active ? 1 : 0);
      return;
    }
    const run = Animated.timing(progress, {
      toValue: active ? 1 : 0,
      duration: active ? 640 : 240,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [active, progress, reducedMotion]);

  const drawn = Math.round(size * CANVAS_SCALE);
  return (
    <View style={[styles.slot, {width: size, height: size}]} pointerEvents="none">
      <AnimatedLottie
        source={NAV_SOURCES[id]}
        progress={progress}
        style={{width: drawn, height: drawn}}
      />
    </View>
  );
}

type TileLottieIconProps = {
  kind: TileIconKind;
  size: number;
  /** Replays the animation whenever this changes (e.g. the amount shown). */
  replayKey?: string | number | boolean;
  /** Recolours the artwork (it is light by default). */
  color?: string;
  /** Off: rest on the finished frame and only play when `replayKey` changes. */
  playOnMount?: boolean;
};

/**
 * Small one-shot icon for tiles, cards and the header. Plays once when it
 * first shows (unless `playOnMount` is off) and again whenever `replayKey`
 * changes; reduced motion shows the finished frame and never plays.
 */
export function TileLottieIcon({
  kind,
  size,
  replayKey,
  color,
  playOnMount = true,
}: TileLottieIconProps) {
  const reducedMotion = useReducedMotion();
  const player = useRef<LottieView>(null);
  const firstKey = useRef(replayKey);
  const [replays, setReplays] = useState(0);

  useEffect(() => {
    if (replayKey === firstKey.current || reducedMotion) {
      return;
    }
    firstKey.current = replayKey;
    setReplays(count => count + 1);
  }, [reducedMotion, replayKey]);

  // Runs after the render that releases the held frame, so play() is not
  // fighting a fixed `progress`.
  useEffect(() => {
    if (replays > 0) {
      player.current?.reset();
      player.current?.play();
    }
  }, [replays]);

  const resting = reducedMotion || (!playOnMount && replays === 0);
  const drawn = Math.round(size * CANVAS_SCALE);
  return (
    <View style={[styles.slot, {width: size, height: size}]} pointerEvents="none">
      <LottieView
        ref={player}
        source={TILE_SOURCES[kind]}
        autoPlay={!resting}
        loop={false}
        colorFilters={color ? [{keypath: '**', color}] : undefined}
        progress={resting ? 1 : undefined}
        style={{width: drawn, height: drawn}}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
