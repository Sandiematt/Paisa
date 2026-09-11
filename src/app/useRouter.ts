import {useCallback, useEffect, useState} from 'react';
import {BackHandler} from 'react-native';

import {RouteName} from './routes';

/**
 * Minimal stack router, enough to carry the pre-auth screens and the wizard
 * until a real navigation library goes in. It tracks travel direction so the
 * screen transition knows which way to slide.
 */
export function useRouter(initial: RouteName) {
  const [stack, setStack] = useState<RouteName[]>([initial]);
  const [direction, setDirection] = useState<1 | -1>(1);

  const route = stack[stack.length - 1];
  const canGoBack = stack.length > 1;

  const push = useCallback((name: RouteName) => {
    setDirection(1);
    setStack(current => [...current, name]);
  }, []);

  /** Replaces the top of the stack, for one-way steps like finishing setup. */
  const replace = useCallback((name: RouteName) => {
    setDirection(1);
    setStack(current => [...current.slice(0, -1), name]);
  }, []);

  const reset = useCallback((name: RouteName) => {
    setDirection(1);
    setStack([name]);
  }, []);

  const pop = useCallback(() => {
    setDirection(-1);
    setStack(current => (current.length > 1 ? current.slice(0, -1) : current));
  }, []);

  // Android's hardware back should always work, even on screens that choose
  // not to draw a back button.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (!canGoBack) {
          return false;
        }
        pop();
        return true;
      },
    );
    return () => subscription.remove();
  }, [canGoBack, pop]);

  return {route, direction, canGoBack, push, replace, pop, reset};
}
