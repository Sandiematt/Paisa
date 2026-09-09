import React, {useCallback, useLayoutEffect, useRef, useState} from 'react';
import {Animated, StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {colors, duration, easing, travel} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {SwapInFlightContext} from './SwapContext';

type SlideSwapProps = {
  swapKey: string;
  /** 1 when moving forward, -1 when going back. */
  direction: 1 | -1;
  render: (swapKey: string) => React.ReactNode;
  distance?: number;
  /**
   * Fill the parent (route stack). Off when the swap lives in a ScrollView
   * and has to size to its content.
   */
  fill?: boolean;
  style?: StyleProp<ViewStyle>;
};

type Layer = {x: Animated.Value; opacity: Animated.Value};

type Phase = {current: string; leaving: string | null};

/**
 * Direction-aware screen swap. Forward content arrives from the right while
 * the previous screen leaves to the left; back reverses it.
 *
 * Two rules keep it from flickering:
 *
 * 1. Every key owns its own animated values. Parking the arriving screen off
 *    to the side must never move whatever is currently on stage, which is
 *    what a single shared value does.
 * 2. Layers are keyed by route, so React preserves the outgoing screen's real
 *    component instance instead of unmounting it and mounting a copy that
 *    replays its own entrance on the way out.
 */
export function SlideSwap({
  swapKey,
  direction,
  render,
  distance = travel.step,
  fill = true,
  style,
}: SlideSwapProps) {
  const reducedMotion = useReducedMotion();
  const layers = useRef(new Map<string, Layer>()).current;
  const running = useRef<Animated.CompositeAnimation | null>(null);

  const [phase, setPhase] = useState<Phase>({current: swapKey, leaving: null});
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const getLayer = useCallback(
    (key: string): Layer => {
      let layer = layers.get(key);
      if (!layer) {
        layer = {
          x: new Animated.Value(0),
          opacity: new Animated.Value(1),
        };
        layers.set(key, layer);
      }
      return layer;
    },
    [layers],
  );

  // Layout effect, not a passive one: the offset below and the state update
  // that swaps the content have to land in the same frame.
  useLayoutEffect(() => {
    const {current, leaving: alreadyLeaving} = phaseRef.current;
    if (swapKey === current) {
      return;
    }

    running.current?.stop();
    running.current = null;

    const incoming = getLayer(swapKey);
    const outgoing = getLayer(current);

    if (reducedMotion) {
      incoming.x.setValue(0);
      incoming.opacity.setValue(1);
      layers.delete(current);
      setPhase({current: swapKey, leaving: null});
      return;
    }

    // Only park the arriving screen off-stage when it is not already on it.
    // Reversing mid-transition should pick up from where it is, not snap.
    if (swapKey !== alreadyLeaving) {
      incoming.x.setValue(distance * direction);
      incoming.opacity.setValue(1);
    }

    setPhase({current: swapKey, leaving: current});

    const anim = Animated.parallel([
      Animated.timing(incoming.x, {
        toValue: 0,
        duration: duration.screenEnter,
        easing: easing.screen,
        useNativeDriver: true,
      }),
      Animated.timing(incoming.opacity, {
        toValue: 1,
        duration: duration.screenExit,
        easing: easing.screen,
        useNativeDriver: true,
      }),
      Animated.timing(outgoing.x, {
        toValue: -distance * direction,
        duration: duration.screenEnter,
        easing: easing.screen,
        useNativeDriver: true,
      }),
      Animated.timing(outgoing.opacity, {
        toValue: 0,
        duration: duration.screenExit,
        easing: easing.screen,
        useNativeDriver: true,
      }),
    ]);

    running.current = anim;
    anim.start(({finished}) => {
      if (!finished) {
        return;
      }
      running.current = null;
      layers.delete(current);
      setPhase({current: swapKey, leaving: null});
    });
  }, [direction, distance, getLayer, layers, reducedMotion, swapKey]);

  useLayoutEffect(() => {
    return () => {
      running.current?.stop();
    };
  }, []);

  const renderLayer = (key: string, isLeaving: boolean) => {
    const layer = getLayer(key);
    const overlay = fill ? styles.overlayFill : styles.overlayTop;
    return (
      <Animated.View
        key={key}
        pointerEvents={isLeaving ? 'none' : 'auto'}
        style={[
          isLeaving ? overlay : fill && styles.fill,
          {opacity: layer.opacity, transform: [{translateX: layer.x}]},
        ]}>
        {render(key)}
      </Animated.View>
    );
  };

  return (
    <SwapInFlightContext.Provider value={phase.leaving !== null}>
      <View style={[styles.stage, fill && styles.fill, style]}>
        {phase.leaving ? renderLayer(phase.leaving, true) : null}
        {renderLayer(phase.current, false)}
      </View>
    </SwapInFlightContext.Provider>
  );
}

const styles = StyleSheet.create({
  stage: {
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  fill: {
    flex: 1,
  },
  overlayFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  // Content-sized swaps (inside a ScrollView) must not stretch to the parent,
  // so the leaving layer is pinned by its top edge only.
  overlayTop: {
    position: 'absolute',
    top: 0,
    right: 0,
    left: 0,
  },
});
