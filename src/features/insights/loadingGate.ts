import {useEffect, useRef, useState} from 'react';

export const SKELETON_DELAY_MS = 250;
export const SKELETON_MIN_MS = 500;

export type LoadingGate = {
  /** Tell the gate whether the underlying work is currently loading. */
  set: (loading: boolean) => void;
  dispose: () => void;
};

/**
 * Debounces a loading flag so a skeleton never flashes:
 * - it only turns on after `delayMs` of continuous loading (fast loads never show it);
 * - once on, it stays on for at least `minMs` (no blink-and-vanish).
 */
export function createLoadingGate(
  onChange: (visible: boolean) => void,
  {delayMs = SKELETON_DELAY_MS, minMs = SKELETON_MIN_MS}: {delayMs?: number; minMs?: number} = {},
): LoadingGate {
  let visible = false;
  let loading = false;
  let shownAt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  const show = () => {
    timer = null;
    visible = true;
    shownAt = Date.now();
    onChange(true);
  };
  const hide = () => {
    timer = null;
    visible = false;
    onChange(false);
  };

  return {
    set(next) {
      if (next === loading) return;
      loading = next;
      clear();
      if (next) {
        if (!visible) timer = setTimeout(show, delayMs);
      } else if (visible) {
        const remaining = minMs - (Date.now() - shownAt);
        if (remaining > 0) timer = setTimeout(hide, remaining);
        else hide();
      }
    },
    dispose: clear,
  };
}

/** React wrapper around `createLoadingGate`. */
export function useLoadingGate(loading: boolean, options?: {delayMs?: number; minMs?: number}): boolean {
  const [visible, setVisible] = useState(false);
  const gateRef = useRef<LoadingGate | null>(null);
  if (gateRef.current === null) {
    gateRef.current = createLoadingGate(setVisible, options);
  }
  useEffect(() => {
    gateRef.current?.set(loading);
  }, [loading]);
  useEffect(() => () => gateRef.current?.dispose(), []);
  return visible;
}
