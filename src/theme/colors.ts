/**
 * Palette sampled from the Wonder Cream Finance home screen:
 * parchment canvas, frosted glass cards, espresso ink, marigold accent.
 *
 * Hierarchy:
 *  - `ink` fills primary type and the selected period pill.
 *  - `accent` is never a large fill except the add button. It marks progress,
 *    the active home tab, and category emphasis.
 */
export const colors = {
  canvas: '#EDE5D6',
  canvasSunk: 'rgba(0, 0, 0, 0.031)',
  surface: '#FFFFFF',
  glass: 'rgba(255, 255, 255, 0.65)',
  surfaceNav: 'rgba(255, 255, 255, 0.9)',
  track: 'rgba(0, 0, 0, 0.06)',
  orbPeach: '#E7B98A',
  orbSand: '#E3D2A8',

  ink: '#22201B',
  inkSecondary: '#5F5A50',
  inkMuted: '#8A857A',
  inkSoft: '#7A7466',
  onInk: '#F6F3EB',

  hairline: 'rgba(0, 0, 0, 0.07)',
  hairlineStrong: 'rgba(0, 0, 0, 0.12)',

  accent: '#D98A2B',
  accentPress: '#C87A1F',
  accentSoft: '#C88A2E1A',
  gold: '#9A6A1E',
  orb: '#F0C878',

  positive: '#3F7A4E',
  teal: '#12998B',
  coral: '#C0523A',
  violet: '#7A6BC4',
  slate: '#8A857A',

  danger: '#C0523A',

  alertDanger: '#C0523A1A',
  alertPositive: '#3F7A4E1A',

  scrim: 'rgba(34, 32, 27, 0.06)',
} as const;

export type ColorToken = keyof typeof colors;
