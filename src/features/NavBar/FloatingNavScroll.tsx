import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {NativeScrollEvent, NativeSyntheticEvent} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {spacing} from '../../theme';

export const FLOATING_NAV_GAP = 12;
export const FLOATING_NAV_PILL_PAD_V = 14;
export const FLOATING_NAV_ITEM_HEIGHT = 48;
export const FLOATING_NAV_PILL_HEIGHT =
  FLOATING_NAV_PILL_PAD_V * 2 + FLOATING_NAV_ITEM_HEIGHT;
/** Air between the last home cards and the top of the floating pill. */
export const FLOATING_NAV_CONTENT_GAP = 40;

/**
 * Height of the floating pill plus the gap to the home indicator.
 * Use this to inset screen content so it does not draw under the bar.
 */
export function useFloatingNavDockHeight() {
  const insets = useSafeAreaInsets();
  return (
    FLOATING_NAV_PILL_HEIGHT +
    FLOATING_NAV_GAP +
    Math.max(insets.bottom, spacing.sm)
  );
}

/**
 * Space scroll content needs under the last piece of content so it clears
 * the overlay with breathing room (Budget / Savings stay fully visible).
 */
export function useFloatingNavClearance() {
  return useFloatingNavDockHeight() + FLOATING_NAV_CONTENT_GAP;
}

type ScrollHandler = (event: NativeSyntheticEvent<NativeScrollEvent>) => void;

type FloatingNavScrollValue = {
  visible: boolean;
  onScroll: ScrollHandler;
  scrollEventThrottle: number;
};

const SHOW_AT_TOP = 12;
const DIRECTION_THRESHOLD = 10;

const FloatingNavScrollContext = createContext<FloatingNavScrollValue>({
  visible: true,
  onScroll: () => {},
  scrollEventThrottle: 16,
});

type ProviderProps = {
  children: React.ReactNode;
  /** When this changes (tab, overlay), the bar comes back. */
  resetKey: string;
};

/**
 * Tracks scroll *direction*, not position. `onScroll` never setStates per
 * frame — visibility flips only when the user clearly commits up or down.
 */
export function FloatingNavScrollProvider({children, resetKey}: ProviderProps) {
  const visibleRef = useRef(true);
  const lastY = useRef(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    visibleRef.current = true;
    lastY.current = 0;
    setVisible(true);
  }, [resetKey]);

  const onScroll = useCallback<ScrollHandler>(event => {
    const y = event.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;

    if (y <= SHOW_AT_TOP) {
      if (!visibleRef.current) {
        visibleRef.current = true;
        setVisible(true);
      }
      return;
    }

    if (dy > DIRECTION_THRESHOLD && visibleRef.current) {
      visibleRef.current = false;
      setVisible(false);
      return;
    }

    if (dy < -DIRECTION_THRESHOLD && !visibleRef.current) {
      visibleRef.current = true;
      setVisible(true);
    }
  }, []);

  const value = useMemo(
    () => ({visible, onScroll, scrollEventThrottle: 16}),
    [onScroll, visible],
  );

  return (
    <FloatingNavScrollContext.Provider value={value}>
      {children}
    </FloatingNavScrollContext.Provider>
  );
}

export function useFloatingNavScroll() {
  return useContext(FloatingNavScrollContext);
}

export function useFloatingNavVisible() {
  return useContext(FloatingNavScrollContext).visible;
}
