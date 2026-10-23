/**
 * DX palette: a dark, violet-lit finance look (ground / surface / glass).
 *
 * Two layers live here:
 *  1. The explicit DX tokens (`ground`, `surface`, `surfaceRaised`, `line`,
 *     `glass`, `text`, `muted`, `glow`, `violet`, `lavender`, `indigo`, `sky`,
 *     `rose`, `roseLight`, `mint`, `gold`). Prefer these in new code.
 *  2. The legacy role names (`canvas`, `ink`, `inkMuted`, `accent`, ...) that
 *     existing screens import. Every one is remapped to a DX value, so the
 *     whole app reads dark without touching call sites:
 *       - `ink*` is now TEXT colour on dark (`ink` is near-white).
 *       - `onInk` is the dark colour for text sitting on a light/ink fill.
 *
 * Hierarchy:
 *  - `ground` is every screen background; `surface` cards/inputs;
 *    `surfaceRaised` sheets, dialogs and toggle-off tracks.
 *  - `violet` is the primary action; `lavender` is the highlight / link /
 *    focus colour (violet text on ground is only ~3:1, use lavender for
 *    small text).
 *  - `mint` income/positive, `roseLight` expense/over-pace/destructive,
 *    `gold` bills and category accents only.
 */

const ground = '#0E0E11';
const surface = '#1B1B20';
const surfaceRaised = '#24242B';
const line = 'rgba(255, 255, 255, 0.08)';
const glass = 'rgba(27, 27, 32, 0.8)';
const text = '#F5F5F7';
const muted = '#A3A3AD';
const glow = '#2B1A72';
const violet = '#6D4AFF';
const lavender = '#B9A7FF';
const indigo = '#5B2EF2';
const sky = '#6CB6FF';
const rose = '#E11D48';
const roseLight = '#FB7193';
const mint = '#5EE0A0';
const gold = '#E9C77B';

export const colors = {
  // --- Explicit DX tokens -------------------------------------------------
  ground,
  surface,
  surfaceRaised,
  line,
  glass,
  text,
  muted,
  glow,
  violet,
  lavender,
  indigo,
  sky,
  rose,
  roseLight,
  mint,
  gold,

  // --- Legacy role names, remapped to DX ---------------------------------
  canvas: ground,
  /** Login/sheet background. Use `surfaceRaised` for floating sheets. */
  sheet: ground,
  field: surface,
  fieldStroke: line,
  googleStroke: 'rgba(255, 255, 255, 0.16)',
  /** Subtle recessed/disabled fill on dark. */
  canvasSunk: 'rgba(255, 255, 255, 0.06)',
  surfaceNav: glass,
  track: 'rgba(255, 255, 255, 0.08)',
  orbPeach: glow,
  orbSand: '#3A2796',

  ink: text,
  inkSecondary: '#C4C4CC',
  inkMuted: muted,
  inkSoft: muted,
  /** Dark text/icon colour for use on a light (ink) fill. */
  onInk: ground,

  hairline: line,
  hairlineStrong: 'rgba(255, 255, 255, 0.14)',

  accent: violet,
  accentPress: indigo,
  accentSoft: 'rgba(109, 74, 255, 0.12)',
  orb: '#8B6CFF',

  positive: mint,
  teal: sky,
  coral: roseLight,
  slate: muted,

  danger: roseLight,

  alertDanger: 'rgba(251, 113, 147, 0.12)',
  alertPositive: 'rgba(94, 224, 160, 0.12)',

  scrim: 'rgba(0, 0, 0, 0.6)',
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Gradient stops, first to last. Angles (CSS degrees) the design uses:
 *  - primary      140deg  icon squares, progress fills
 *  - fab          140deg  add button (stops at 0 / 55 / 100%)
 *  - budgetStrip  90deg   home spotlight strip
 *  - savings      140deg  savings / info icon squares and rings
 *  - rose         140deg  dining / over-pace
 * Render with `GradientView` / `linearGradient()` rather than by hand.
 */
export const gradients = {
  primary: [lavender, violet],
  fab: [lavender, violet, indigo],
  budgetStrip: [indigo, violet],
  savings: [sky, indigo],
  rose: [roseLight, rose],
} as const;

export type GradientKey = keyof typeof gradients;

/** Default CSS angle per gradient (budgetStrip runs left to right). */
export const gradientAngles: Record<GradientKey, number> = {
  primary: 140,
  fab: 140,
  budgetStrip: 90,
  savings: 140,
  rose: 140,
};
