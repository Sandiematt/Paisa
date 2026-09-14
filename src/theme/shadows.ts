import {Platform, ViewStyle} from 'react-native';

import {colors} from './colors';

const warm = '#78643C';

function iosShadow(opacity: number, radius: number, offsetY: number): ViewStyle {
  return {
    shadowColor: warm,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: {width: 0, height: offsetY},
  };
}

/**
 * Wonder elevation: warm brown shadows, not cool navy.
 * Android elevation cannot tint the shadow; keep it low so cards stay soft.
 */
export const shadows = {
  avatar: Platform.select<ViewStyle>({
    ios: iosShadow(0.15, 5, 2),
    default: {elevation: 2, shadowColor: warm},
  })!,
  card: Platform.select<ViewStyle>({
    ios: iosShadow(0.12, 14, 8),
    default: {elevation: 3, shadowColor: warm},
  })!,
  cardSoft: Platform.select<ViewStyle>({
    ios: iosShadow(0.1, 10, 6),
    default: {elevation: 2, shadowColor: warm},
  })!,
  nav: Platform.select<ViewStyle>({
    ios: iosShadow(0.18, 15, 10),
    default: {elevation: 8, shadowColor: warm},
  })!,
  add: Platform.select<ViewStyle>({
    ios: {
      shadowColor: colors.accent,
      shadowOpacity: 0.5,
      shadowRadius: 7,
      shadowOffset: {width: 0, height: 4},
    },
    default: {elevation: 6, shadowColor: colors.accent},
  })!,
} as const;
