import {TextStyle} from 'react-native';

/**
 * Plus Jakarta Sans throughout (DX). Weight lives in the family name, so never
 * pair these with `fontWeight` on iOS (it drops the named face).
 *
 * The legacy keys (`outfitBold`, `outfitSemi`, `interMedium`, `interSemi`) are
 * kept so existing screens keep working; they now resolve to Jakarta faces.
 * New code should use the `jakarta*` keys.
 */
export const fonts = {
  jakartaRegular: 'PlusJakartaSans-Regular',
  jakartaMedium: 'PlusJakartaSans-Medium',
  jakartaSemiBold: 'PlusJakartaSans-SemiBold',
  jakartaBold: 'PlusJakartaSans-Bold',
  jakartaExtraBold: 'PlusJakartaSans-ExtraBold',

  /** Legacy aliases (hero / display numbers). */
  outfitBold: 'PlusJakartaSans-ExtraBold',
  outfitSemi: 'PlusJakartaSans-Bold',
  interMedium: 'PlusJakartaSans-Medium',
  interSemi: 'PlusJakartaSans-SemiBold',
} as const;

type Variant =
  | 'display'
  | 'title'
  | 'sectionTitle'
  | 'heading'
  | 'rowLabel'
  | 'body'
  | 'bodyStrong'
  | 'label'
  | 'caption'
  | 'numeric'
  | 'numericHero';

/**
 * DX scale. `title` is the 20/26 screen title; `sectionTitle` is the 20 bold
 * section header (-0.3 tracking); `heading` is the 16 bold card title;
 * `rowLabel` is the 16 semibold settings/list row label.
 */
export const typography: Record<Variant, TextStyle> = {
  display: {
    fontFamily: fonts.jakartaExtraBold,
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontFamily: fonts.jakartaBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  sectionTitle: {
    fontFamily: fonts.jakartaBold,
    fontSize: 20,
    lineHeight: 26,
    letterSpacing: -0.3,
  },
  heading: {
    fontFamily: fonts.jakartaBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  rowLabel: {
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0,
  },
  body: {
    fontFamily: fonts.jakartaMedium,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  bodyStrong: {
    fontFamily: fonts.jakartaSemiBold,
    fontSize: 15,
    lineHeight: 21,
    letterSpacing: 0,
  },
  label: {
    fontFamily: fonts.jakartaMedium,
    fontSize: 13,
    lineHeight: 18,
    letterSpacing: 0,
  },
  caption: {
    fontFamily: fonts.jakartaRegular,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 0,
  },
  numeric: {
    fontFamily: fonts.jakartaBold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.2,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
  numericHero: {
    fontFamily: fonts.jakartaExtraBold,
    fontSize: 44,
    lineHeight: 48,
    letterSpacing: -1.5,
    fontVariant: ['tabular-nums'],
    includeFontPadding: false,
  },
};

export type TypographyVariant = Variant;
