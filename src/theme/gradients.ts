import type {ViewStyle} from 'react-native';

import {GradientKey, gradientAngles, gradients} from './colors';

type BackgroundImage = NonNullable<ViewStyle['backgroundImage']>;

/**
 * Builds an RN 0.87 `backgroundImage` linear gradient from evenly spaced
 * stops (or explicit 0..1 positions).
 *
 *   <View style={{backgroundImage: linearGradient('primary')}} />
 */
export function linearGradient(
  source: GradientKey | readonly string[],
  angle?: number,
  positions?: readonly number[],
): BackgroundImage {
  const stops: readonly string[] =
    typeof source === 'string' ? gradients[source] : source;
  const deg =
    angle ?? (typeof source === 'string' ? gradientAngles[source] : 180);
  return [
    {
      type: 'linear-gradient',
      direction: `${deg}deg`,
      colorStops: stops.map((color, index) => {
        const at = positions?.[index] ?? index / Math.max(stops.length - 1, 1);
        return {color, positions: [`${Math.round(at * 100)}%`]};
      }),
    },
  ] as BackgroundImage;
}

/** `#RRGGBB` plus alpha 0..1 to an rgba() string. */
export function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
