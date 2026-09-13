import {createAnimations} from '@tamagui/animations-react-native';
import {defaultConfig} from '@tamagui/config/v5';
import {createTamagui} from '@tamagui/core';

/**
 * React Native Animated driver (https://tamagui.dev/docs/core/animations).
 * Timing names match press / swap / enter tokens. Springs stay for slides
 * that need a short settle without bouncing past the edge.
 */
export const animations = createAnimations({
  '0ms': {type: 'timing', duration: 0},
  '50ms': {type: 'timing', duration: 50},
  '75ms': {type: 'timing', duration: 75},
  '100ms': {type: 'timing', duration: 100},
  '150ms': {type: 'timing', duration: 150},
  '200ms': {type: 'timing', duration: 200},
  '250ms': {type: 'timing', duration: 250},
  '280ms': {type: 'timing', duration: 280},
  '300ms': {type: 'timing', duration: 300},
  '400ms': {type: 'timing', duration: 400},
  '500ms': {type: 'timing', duration: 500},
  quick: {type: 'spring', damping: 25, mass: 1, stiffness: 550},
  quickLessBouncy: {type: 'spring', damping: 40, mass: 2, stiffness: 400},
  quicker: {type: 'spring', damping: 16, mass: 0.6, stiffness: 700},
  medium: {damping: 16, stiffness: 90, mass: 0.8},
  lazy: {type: 'spring', damping: 18, mass: 0.9, stiffness: 50},
  bouncy: {type: 'spring', damping: 18, mass: 0.9, stiffness: 120},
});

export const config = createTamagui({
  ...defaultConfig,
  animations,
  settings: {
    ...defaultConfig.settings,
    onlyAllowShorthands: false,
    styleCompat: 'react-native',
    defaultPosition: 'relative',
    disableSSR: true,
  },
} as Parameters<typeof createTamagui>[0]);
