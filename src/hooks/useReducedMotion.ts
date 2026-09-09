import {useEffect, useState} from 'react';
import {AccessibilityInfo} from 'react-native';

/**
 * Mirrors the OS "reduce motion" setting. Every animated component in the app
 * reads this and degrades to a gentler variant rather than to nothing:
 * opacity and colour survive, positional movement does not.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (active) {
        setReduced(value);
      }
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduced,
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
