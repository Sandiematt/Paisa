import React, {useEffect, useRef, useState} from 'react';
import {Animated, Easing, View} from 'react-native';
import LottieView from 'lottie-react-native';

import {useReducedMotion} from '../../hooks/useReducedMotion';
import {ColorScheme, makeStyles, palettes, useTheme} from '../../theme';

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
  receipt: require('../../../assets/animations/tile-receipt.json'),
} as const;

export type NavIconId = keyof typeof NAV_SOURCES;
export type TileIconKind = keyof typeof TILE_SOURCES;

type LottieSource = (typeof NAV_SOURCES)[NavIconId];

const toRgb = (hex: string) =>
  [1, 3, 5].map(at => parseInt(hex.slice(at, at + 2), 16) / 255);

/**
 * Returns a copy of a Lottie document with its fill and stroke colours (`c`
 * values, static or keyframed) swapped by RGB; alpha is kept.
 */
function recolor(source: LottieSource, swaps: [string, string][]): LottieSource {
  const pairs = swaps.map(([from, to]) => [toRgb(from), toRgb(to)]);
  const swap = (rgba: number[]) => {
    const hit = pairs.find(([from]) =>
      from.every((channel, i) => Math.abs(channel - rgba[i]) < 0.004),
    );
    return hit ? [...hit[1], rgba[3]] : rgba;
  };
  const walk = (node: unknown, inColor: boolean): unknown => {
    if (Array.isArray(node)) {
      if (inColor && node.length === 4 && node.every(n => typeof n === 'number')) {
        return swap(node);
      }
      return node.map(child => walk(child, inColor));
    }
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [
          key,
          walk(child, inColor || key === 'c'),
        ]),
      );
    }
    return node;
  };
  return walk(source, false) as LottieSource;
}

/** Returns a copy of a Lottie document with every fill and stroke in `hex`. */
export function tintLottie<T>(source: T, hex: string): T {
  const rgb = toRgb(hex);
  const walk = (node: unknown, inColor: boolean): unknown => {
    if (Array.isArray(node)) {
      // Exporters write colours as RGBA or plain RGB (loading.json is RGB).
      if (
        inColor &&
        (node.length === 3 || node.length === 4) &&
        node.every(n => typeof n === 'number')
      ) {
        return node.length === 4 ? [...rgb, node[3]] : rgb;
      }
      return node.map(child => walk(child, inColor));
    }
    if (node && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node).map(([key, child]) => [
          key,
          walk(child, inColor || key === 'c'),
        ]),
      );
    }
    return node;
  };
  return walk(source, false) as T;
}

const tintedTiles = new Map<string, LottieSource>();

/**
 * Tile artwork is baked near-white for gradient squares. Any other colour is
 * written into the document itself rather than through `colorFilters`, which
 * native Lottie applies unevenly (icons came out washed out on light).
 */
function tileSource(kind: TileIconKind, color: string | undefined): LottieSource {
  if (!color) {
    return TILE_SOURCES[kind];
  }
  const key = `${kind}:${color}`;
  let source = tintedTiles.get(key);
  if (!source) {
    source = tintLottie(TILE_SOURCES[kind], color);
    tintedTiles.set(key, source);
  }
  return source;
}

/**
 * The nav artwork is baked for the dark bar: a muted outline, a `text` fill
 * and a door cutout in `surfaceRaised`, the active pill behind it. The light
 * bar repaints those as muted, indigo and the `wash` pill.
 */
const lightNavSources: Partial<Record<NavIconId, LottieSource>> = {};

function navSource(id: NavIconId, scheme: ColorScheme): LottieSource {
  if (scheme === 'dark') {
    return NAV_SOURCES[id];
  }
  let source = lightNavSources[id];
  if (!source) {
    const {dark, light} = palettes;
    source = recolor(NAV_SOURCES[id], [
      [dark.muted, light.muted],
      [dark.text, light.indigo],
      [dark.surfaceRaised, light.wash],
    ]);
    lightNavSources[id] = source;
  }
  return source;
}

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
  const styles = useStyles();
  const {scheme} = useTheme();
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
        source={navSource(id, scheme)}
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
  /** Recolours the artwork (it is white by default, for gradient squares). */
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
  const styles = useStyles();
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
        source={tileSource(kind, color)}
        autoPlay={!resting}
        loop={false}
        progress={resting ? 1 : undefined}
        style={{width: drawn, height: drawn}}
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
