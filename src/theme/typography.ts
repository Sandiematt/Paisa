import {TextStyle} from 'react-native';

/**
 * Outfit for display and money, Inter for labels.
 * If the linked fonts are missing, the platform grotesk is used.
 */
export const fonts = {
  outfitBold: 'Outfit-Bold',
  outfitSemi: 'Outfit-SemiBold',
  interMedium: 'Inter-Medium',
  interSemi: 'Inter-SemiBold',
} as const;

type Variant =
  | 'display'
  | 'title'
  | 'heading'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'numeric'
  | 'numericHero';

export const typography: Record<Variant, TextStyle> = {
  display: {
    fontFamily: fonts.outfitBold,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  title: {
    fontFamily: fonts.outfitSemi,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  heading: {
    fontFamily: fonts.outfitSemi,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600',
    letterSpacing: -0.45,
  },
  body: {
    fontFamily: fonts.interMedium,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '500',
    letterSpacing: -0.1,
  },
  bodyStrong: {
    fontFamily: fonts.interSemi,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  label: {
    fontFamily: fonts.interMedium,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    letterSpacing: 0,
  },
  caption: {
    fontFamily: fonts.interMedium,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '500',
    letterSpacing: 0,
  },
  numeric: {
    fontFamily: fonts.outfitSemi,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  numericHero: {
    fontFamily: fonts.outfitBold,
    fontSize: 52,
    lineHeight: 58,
    fontWeight: '700',
    letterSpacing: -2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
};

export type TypographyVariant = Variant;
