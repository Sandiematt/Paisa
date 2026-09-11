/**
 * Palette sampled from the product reference: warm paper canvas, pure white
 * cards, near-black ink, marigold accent.
 *
 * Hierarchy rule for this app:
 *  - `ink` fills primary actions (cream text on near-black clears WCAG AAA).
 *  - `accent` is never a button fill. It marks progress, selection and focus.
 *    White on marigold is ~2:1 and would fail AA.
 */
export const colors = {
  canvas: '#F2EFE6',
  canvasSunk: '#EAE6DB',
  surface: '#FFFFFF',

  ink: '#151412',
  inkSecondary: '#565248',
  inkMuted: '#8E887A',
  onInk: '#F6F3EB',

  hairline: '#E3DED2',
  hairlineStrong: '#CFC8B8',

  accent: '#E9A63C',
  accentPress: '#CE8F2C',
  accentSoft: '#FBF0DA',

  positive: '#2F9E63',
  teal: '#12998B',
  coral: '#E4573D',
  violet: '#7A6BC4',
  slate: '#8E887A',

  danger: '#C2412A',

  alertDanger: '#FDECEA',
  alertPositive: '#E8F5EE',

  scrim: 'rgba(21, 20, 18, 0.06)',
} as const;

export type ColorToken = keyof typeof colors;
