import {Platform, TextStyle} from 'react-native';

/**
 * The reference uses a tight geometric grotesk. Shipping a custom face needs
 * native font assets, so we render on the platform grotesk (SF Pro / Roboto)
 * and reproduce the feel with weight and negative tracking. Swapping in a real
 * family later is a one-line change to `family`.
 */
const family = Platform.select({
  ios: {sans: undefined as string | undefined},
  android: {sans: undefined as string | undefined},
  default: {sans: undefined as string | undefined},
})!;

type Variant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'numeric';

export const typography: Record<Variant, TextStyle> = {
  display: {
    fontFamily: family.sans,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  title: {
    fontFamily: family.sans,
    fontSize: 27,
    lineHeight: 32,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  heading: {
    fontFamily: family.sans,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  body: {
    fontFamily: family.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '400',
    letterSpacing: -0.1,
  },
  bodyStrong: {
    fontFamily: family.sans,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: family.sans,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    letterSpacing: -0.05,
  },
  caption: {
    fontFamily: family.sans,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: 0,
  },
  numeric: {
    fontFamily: family.sans,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '700',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
};

export type TypographyVariant = Variant;
