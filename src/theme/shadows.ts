import {Platform, ViewStyle} from 'react-native';

import {ColorScheme, getActiveScheme} from './colors';

const black = '#000000';
const violetGlow = '#6D4AFF';
/** Light-scheme card shadow tint (`dx-light/shadow`). */
const lightTint = '#2B1A72';

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
 * DX elevation. Dark: dark, soft shadows. Light: a faint violet-tinted lift
 * (`0 4 14 dx-light/shadow`), as in the light designs. Coloured glow is
 * reserved for the violet add button (`add`) and gradient icon squares
 * (`iconGlow`) in both schemes.
 * Android elevation cannot tint the shadow; keep it low so cards stay soft.
 */
function buildShadows(scheme: ColorScheme) {
  const tint = scheme === 'light' ? lightTint : black;
  const k = scheme === 'light' ? 0.25 : 1;
  return {
    avatar: Platform.select<ViewStyle>({
      ios: iosShadow(0.4 * k, 5, 2, tint),
      default: {elevation: 2, shadowColor: tint},
    })!,
    card: Platform.select<ViewStyle>({
      ios: iosShadow(0.45 * k, 14, 8, tint),
      default: {elevation: 3, shadowColor: tint},
    })!,
    cardSoft: Platform.select<ViewStyle>({
      ios: iosShadow(0.35 * k, 10, 6, tint),
      default: {elevation: 2, shadowColor: tint},
    })!,
    /** Floating nav pill: rgba(0,0,0,0.5) 0 12 30 on dark. */
    nav: Platform.select<ViewStyle>({
      ios: iosShadow(0.5 * k, 15, 12, tint),
      default: {elevation: 8, shadowColor: tint},
    })!,
    /**
     * Violet FAB glow: rgba(109,74,255,0.55) 0 10 26. `boxShadow` follows the
     * round outline on both platforms; Android `elevation` cannot tint the
     * shadow and draws it unevenly under a gradient background.
     */
    add: {
      boxShadow:
        scheme === 'light'
          ? '0px 10px 24px rgba(109, 74, 255, 0.35)'
          : '0px 10px 26px rgba(109, 74, 255, 0.55)',
    } as ViewStyle,
    /** Gradient icon square glow: rgba(109,74,255,0.45) 0 6 16. */
    iconGlow: Platform.select<ViewStyle>({
      ios: iosShadow(scheme === 'light' ? 0.3 : 0.45, 8, 6, violetGlow),
      default: {elevation: 4, shadowColor: violetGlow},
    })!,
  } as const;
}

type Shadows = ReturnType<typeof buildShadows>;

const built: Record<ColorScheme, Shadows> = {
  dark: buildShadows('dark'),
  light: buildShadows('light'),
};

/** Live shadows for the active scheme; read during render, like `colors`. */
export const shadows: Shadows = new Proxy({} as Shadows, {
  get: (_target, key) => built[getActiveScheme()][key as keyof Shadows],
});
