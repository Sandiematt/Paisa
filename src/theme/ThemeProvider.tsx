import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Canvas,
  Group,
  Image,
  Skia,
  makeImageFromView,
} from '@shopify/react-native-skia';
import type {SkImage} from '@shopify/react-native-skia';
import React, {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {Easing, LayoutChangeEvent, StyleSheet, View} from 'react-native';

import {ColorScheme, Palette, palettes, setActiveScheme} from './colors';

const STORAGE_KEY = 'paisa.colorScheme';
/** Telegram-style reveal length. */
export const REVEAL_MS = 420;
/** Fast start, soft landing: the circle covers most of the screen early. */
const ease = Easing.out(Easing.cubic);

type ThemeContextValue = {
  scheme: ColorScheme;
  colors: Palette;
  /**
   * Flips the scheme with a circular reveal growing from (x, y), in window
   * coordinates (a press event's `pageX` / `pageY`). Pass `animate: false`
   * (reduced motion) to switch instantly. Taps during a reveal are ignored.
   */
  toggle: (x: number, y: number, animate?: boolean) => void;
};

/** Outside a provider (tests, isolated renders) everything reads dark. */
const ThemeContext = createContext<ThemeContextValue>({
  scheme: 'dark',
  colors: palettes.dark,
  toggle: () => {},
});

type StyleObject = Parameters<typeof StyleSheet.create>[0];

/** Skia types its ref for class components; RN 0.87's View is a host element. */
const snapshot = (ref: React.RefObject<React.ComponentRef<typeof View> | null>) =>
  makeImageFromView(ref as unknown as React.RefObject<number | null>);

const nextFrame = () =>
  new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

/**
 * A commit is in JS; the native views it produced are on screen a frame or
 * two later. Two frames cover the mount and the draw.
 */
const afterPaint = async () => {
  await nextFrame();
  await nextFrame();
};

type Size = {width: number; height: number};

type RevealHandle = {
  /** Paints `image` over the app; resolves once it is on screen. */
  cover: (image: SkImage) => Promise<void>;
  /**
   * `grow`: a hole opens in the cover from (cx, cy) until it spans the screen.
   * `shrink`: the cover itself becomes a circle that closes into (cx, cy).
   */
  reveal: (
    cx: number,
    cy: number,
    maxRadius: number,
    mode: RevealMode,
  ) => Promise<void>;
  clear: () => void;
};

type RevealMode = 'grow' | 'shrink';

/** `r: null` paints the whole cover, before the reveal starts. */
type RevealState = {
  image: SkImage;
  cx: number;
  cy: number;
  r: number | null;
  mode: RevealMode;
};

/**
 * The old-scheme snapshot, clipped by a circle at the toggle, over the live
 * app (already in the new scheme, animations and all). Growing, the circle is
 * a hole that spreads out of the icon; shrinking, it is the old screen pulling
 * back into the icon. It owns the per-frame state, so only this canvas
 * re-renders while the circle moves.
 * The canvas stays mounted: a Skia view created at tap time draws its first
 * frame late, and the new scheme flashed through before the cover landed.
 */
const RevealOverlay = forwardRef<RevealHandle, Size>(function RevealOverlayView(
  {width, height},
  ref,
) {
  const [state, setState] = useState<RevealState | null>(null);
  const committed = useRef<(() => void) | null>(null);

  useEffect(() => {
    const done = committed.current;
    committed.current = null;
    done?.();
  });

  useImperativeHandle(
    ref,
    () => ({
      cover: image =>
        new Promise<void>(resolve => {
          committed.current = () => {
            afterPaint().then(resolve);
          };
          setState({image, cx: 0, cy: 0, r: null, mode: 'grow'});
        }),
      reveal: (cx, cy, maxRadius, mode) =>
        new Promise<void>(resolve => {
          let start: number | null = null;
          const tick = (now: number) => {
            start ??= now;
            const t = Math.min((now - start) / REVEAL_MS, 1);
            const p = ease(t);
            const r = (mode === 'grow' ? p : 1 - p) * maxRadius;
            setState(prev => (prev ? {...prev, cx, cy, r, mode} : prev));
            if (t < 1) {
              requestAnimationFrame(tick);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(tick);
        }),
      clear: () => setState(null),
    }),
    [],
  );

  const circle = useMemo(() => {
    if (!state || state.r === null) {
      return undefined;
    }
    const r = Math.max(state.r, 0);
    const {cx, cy} = state;
    return Skia.RRectXY(Skia.XYWHRect(cx - r, cy - r, r * 2, r * 2), r, r);
  }, [state]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {state ? (
        <Group clip={circle} invertClip={state.mode === 'grow'}>
          <Image
            image={state.image}
            x={0}
            y={0}
            width={width}
            height={height}
            fit="cover"
          />
        </Group>
      ) : null}
    </Canvas>
  );
});

/**
 * Owns the colour scheme and the switch animation, after William Candillon's
 * Telegram theme toggle:
 *   1. snapshot the app in the old scheme and wait until that cover is on
 *      screen, so the switch underneath is never seen,
 *   2. switch the scheme and wait for the whole tree to commit and paint,
 *   3. to light, grow a hole in the cover out of the sun; to dark, shrink
 *      the cover into the moon, showing the live app either way,
 *   4. drop the cover once it is fully cleared (nothing visible changes).
 * The reference paints a second snapshot inside the circle; revealing the live
 * app instead keeps running animations (the sun/moon swap) visible and avoids
 * a pop when the overlay goes. The radius is driven by requestAnimationFrame
 * instead of Reanimated, which this app keeps out of its native build.
 */
export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [scheme, setScheme] = useState<ColorScheme | null>(null);
  const [size, setSize] = useState<Size>({width: 0, height: 0});
  const rootRef = useRef<React.ComponentRef<typeof View>>(null);
  const overlayRef = useRef<RevealHandle>(null);
  const schemeRef = useRef(scheme);
  const sizeRef = useRef(size);
  const busy = useRef(false);
  const pendingCommit = useRef<(() => void) | null>(null);

  schemeRef.current = scheme;
  sizeRef.current = size;

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .catch(() => null)
      .then(saved => {
        if (!cancelled) {
          setScheme(saved === 'light' ? 'light' : 'dark');
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Parent effects run after every child's, so by now the whole tree has
  // committed in the new scheme.
  useEffect(() => {
    const done = pendingCommit.current;
    pendingCommit.current = null;
    done?.();
  }, [scheme]);

  const resolved: ColorScheme = scheme ?? 'dark';
  // Children read `colors` during this render, so flip the live palette
  // before they do.
  setActiveScheme(resolved);

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    const {width, height} = event.nativeEvent.layout;
    setSize({width, height});
  }, []);

  const toggle = useCallback(async (x: number, y: number, animate = true) => {
    const current = schemeRef.current;
    if (busy.current || current === null) {
      return;
    }
    busy.current = true;
    const next: ColorScheme = current === 'dark' ? 'light' : 'dark';
    const overlay = overlayRef.current;
    const switchScheme = () =>
      new Promise<void>(resolve => {
        pendingCommit.current = resolve;
        setScheme(next);
      });

    try {
      const before = animate && overlay ? await snapshot(rootRef) : null;
      if (!before || !overlay) {
        await switchScheme();
        return;
      }
      await overlay.cover(before);
      await switchScheme();
      await afterPaint();
      const {width, height} = sizeRef.current;
      const maxRadius = Math.max(
        Math.hypot(x, y),
        Math.hypot(width - x, y),
        Math.hypot(x, height - y),
        Math.hypot(width - x, height - y),
      );
      // Light spreads out of the sun; going dark, the light screen pulls
      // back into the moon.
      await overlay.reveal(x, y, maxRadius, next === 'light' ? 'grow' : 'shrink');
    } catch {
      // Snapshotting can fail (e.g. while the app is backgrounding); fall
      // back to an instant switch rather than leaving the old scheme.
      if (schemeRef.current !== next) {
        setScheme(next);
      }
    } finally {
      overlay?.clear();
      busy.current = false;
      AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
    }
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      scheme: resolved,
      colors: palettes[resolved],
      toggle: (x, y, animate) => {
        toggle(x, y, animate);
      },
    }),
    [resolved, toggle],
  );

  return (
    <View style={styles.root}>
      <View
        ref={rootRef}
        style={[styles.root, {backgroundColor: palettes[resolved].ground}]}
        collapsable={false}
        onLayout={onLayout}>
        <ThemeContext.Provider value={value}>
          {scheme === null ? null : children}
        </ThemeContext.Provider>
      </View>
      {scheme === null ? null : (
        <RevealOverlay ref={overlayRef} width={size.width} height={size.height} />
      )}
    </View>
  );
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

/**
 * Theme-aware `StyleSheet.create`. Returns a hook that builds the sheet once
 * per scheme and re-renders the caller when the scheme changes:
 *
 *   const useStyles = makeStyles(() => ({
 *     root: {backgroundColor: colors.ground},
 *   }));
 *   function Card() {
 *     const styles = useStyles();
 *   }
 */
export function makeStyles<S extends StyleObject>(
  factory: (colors: Palette) => S,
): () => Readonly<S> {
  const cache: Partial<Record<ColorScheme, Readonly<S>>> = {};
  return function useStyles() {
    const {scheme} = useTheme();
    let sheet = cache[scheme];
    if (!sheet) {
      // The factory may read the live `colors` / `shadows` instead of its
      // argument; make sure they resolve to this scheme.
      setActiveScheme(scheme);
      sheet = StyleSheet.create(factory(palettes[scheme]));
      cache[scheme] = sheet;
    }
    return sheet;
  };
}

const styles = StyleSheet.create({
  root: {flex: 1},
});
