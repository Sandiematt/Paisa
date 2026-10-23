import {Platform, ViewStyle} from 'react-native';

const black = '#000000';
const violetGlow = '#6D4AFF';

function iosShadow(
  opacity: number,
  radius: number,
  offsetY: number,
  color: string = black,
): ViewStyle {
  return {
    shadowColor: color,
    shadowOpacity: opacity,
    shadowRadius: radius,
    shadowOffset: {width: 0, height: offsetY},
  };
}

/**
 * DX elevation: dark, soft shadows. Coloured glow is reserved for the violet
 * add button (`add`) and gradient icon squares (`iconGlow`).
 * Android elevation cannot tint the shadow; keep it low so cards stay soft.
 */
export const shadows = {
  avatar: Platform.select<ViewStyle>({
    ios: iosShadow(0.4, 5, 2),
    default: {elevation: 2, shadowColor: black},
  })!,
  card: Platform.select<ViewStyle>({
    ios: iosShadow(0.45, 14, 8),
    default: {elevation: 3, shadowColor: black},
  })!,
  cardSoft: Platform.select<ViewStyle>({
    ios: iosShadow(0.35, 10, 6),
    default: {elevation: 2, shadowColor: black},
  })!,
  /** Floating nav pill: rgba(0,0,0,0.5) 0 12 30. */
  nav: Platform.select<ViewStyle>({
    ios: iosShadow(0.5, 15, 12),
    default: {elevation: 8, shadowColor: black},
  })!,
  /** Violet FAB glow: rgba(109,74,255,0.55) 0 10 26. */
  add: Platform.select<ViewStyle>({
    ios: iosShadow(0.55, 13, 10, violetGlow),
    default: {elevation: 8, shadowColor: violetGlow},
  })!,
  /** Gradient icon square glow: rgba(109,74,255,0.45) 0 6 16. */
  iconGlow: Platform.select<ViewStyle>({
    ios: iosShadow(0.45, 8, 6, violetGlow),
    default: {elevation: 4, shadowColor: violetGlow},
  })!,
} as const;
