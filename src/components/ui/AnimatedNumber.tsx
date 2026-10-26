import React, {useEffect, useRef, useState} from 'react';

import {easing} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {AppText} from './AppText';

type AnimatedNumberProps = Omit<React.ComponentProps<typeof AppText>, 'children'> & {
  value: number;
  /** Turns the in-flight number into display text, e.g. `formatMoney`. */
  format: (value: number) => string;
  /** Count length. Kept short: the number is read, not watched. */
  durationMs?: number;
  /**
   * Remembers the last value shown under this key, so a screen that remounts
   * (switching tabs) starts from what the user last saw instead of replaying
   * the count from zero. Without a key every mount counts up from 0.
   */
  memoryKey?: string;
};

const lastShown = new Map<string, number>();

/**
 * Counts from the previous value to the new one. Only this text node
 * re-renders while counting; the frame loop stops as soon as it lands.
 * Screen readers always get the final value.
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = 900,
  memoryKey,
  accessibilityLabel,
  ...textProps
}: AnimatedNumberProps) {
  const reducedMotion = useReducedMotion();
  const startFrom = memoryKey != null ? lastShown.get(memoryKey) ?? 0 : 0;
  const [shown, setShown] = useState(reducedMotion ? value : startFrom);
  const shownRef = useRef(shown);
  shownRef.current = shown;

  useEffect(() => {
    if (memoryKey != null) {
      lastShown.set(memoryKey, value);
    }
    const from = shownRef.current;
    if (reducedMotion || from === value || typeof requestAnimationFrame !== 'function') {
      setShown(value);
      return;
    }

    let frame = 0;
    let start: number | null = null;
    const tick = (now: number) => {
      if (start == null) {
        start = now;
      }
      const t = Math.min(1, (now - start) / durationMs);
      setShown(from + (value - from) * easing.out(t));
      if (t < 1) {
        frame = requestAnimationFrame(tick);
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [durationMs, memoryKey, reducedMotion, value]);

  const finalText = format(value);
  return (
    <AppText {...textProps} accessibilityLabel={accessibilityLabel ?? finalText}>
      {shown === value ? finalText : format(shown)}
    </AppText>
  );
}
