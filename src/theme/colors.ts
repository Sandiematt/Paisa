/**
 * DX palettes: a dark, violet-lit finance look and its light counterpart
 * (Wonder: "DX Home Light", "DX Insights Light", "DX Profile Light", tokens
 * `dx-light/*`). Both palettes share every key, so screens read roles, never
 * hex values.
 *
 * Two layers live here:
 *  1. The explicit DX tokens (`ground`, `surface`, `surfaceRaised`, `line`,
 *     `glass`, `text`, `muted`, `glow`, `violet`, `lavender`, `indigo`, `sky`,
 *     `rose`, `roseLight`, `mint`, `gold`). Prefer these in new code.
 *  2. The legacy role names (`canvas`, `ink`, `inkMuted`, `accent`, ...) that
 *     existing screens import, each remapped to a DX value:
 *       - `ink*` is TEXT colour (`ink` is near-white on dark, near-black on
 *         light).
 *       - `onInk` is the colour for text sitting on an `ink` fill.
 *
 * Hierarchy:
 *  - `ground` is every screen background; `surface` cards/inputs;
 *    `surfaceRaised` sheets, dialogs and toggle-off tracks.
 *  - `violet` is the primary action; `lavender` is the highlight / link /
 *    focus TEXT colour (lavender on dark, indigo on light).
 *  - `mint` income/positive, `roseLight` expense/over-pace/destructive,
 *    `gold` bills and category accents only.
 *  - `onAccent` is text/icons on a violet or gradient fill (white in both).
 *
 * `colors` always resolves against the active scheme. Read it during render
 * (inside `makeStyles` factories or components that call `useTheme`), never
 * at module load, or the value freezes on the scheme the app booted with.
 */

/** Brand stops shared by both schemes (gradients, glows, charts). */
export const brand = {
  violet: '#6D4AFF',
  lavender: '#B9A7FF',
  indigo: '#5B2EF2',
  sky: '#6CB6FF',
  rose: '#E11D48',
  roseLight: '#FB7193',
  orb: '#8B6CFF',
} as const;

function buildDark() {
  const ground = '#0E0E11';
  const surface = '#1B1B20';
  const surfaceRaised = '#24242B';
  const line = 'rgba(255, 255, 255, 0.08)';
  const glass = 'rgba(27, 27, 32, 0.8)';
  const text = '#F5F5F7';
  const muted = '#A3A3AD';
  const glow = '#2B1A72';
  const lavender = brand.lavender;
  const roseLight = brand.roseLight;
  const mint = '#5EE0A0';
  const gold = '#E9C77B';

  return {
    ground,
    surface,
    surfaceRaised,
    line,
    glass,
    text,
    muted,
    glow,
    violet: brand.violet,
    lavender,
    indigo: brand.indigo,
    sky: brand.sky,
    rose: brand.rose,
    roseLight,
    mint,
    gold,
    onAccent: '#FFFFFF',
    /** Tinted wash behind accent chips and the active nav item. */
    wash: 'rgba(109, 74, 255, 0.16)',
    /** Soft shadow tint for cards. */
    shadow: '#000000',

    canvas: ground,
    sheet: ground,
    field: surface,
    fieldStroke: line,
    googleStroke: 'rgba(255, 255, 255, 0.16)',
    canvasSunk: 'rgba(255, 255, 255, 0.06)',
    surfaceNav: glass,
    track: 'rgba(255, 255, 255, 0.08)',
    orbPeach: glow,
    orbSand: '#3A2796',

    ink: text,
    inkSecondary: '#C4C4CC',
    inkMuted: muted,
    inkSoft: muted,
    onInk: ground,

    hairline: line,
    hairlineStrong: 'rgba(255, 255, 255, 0.14)',

    accent: brand.violet,
    accentPress: brand.indigo,
    accentSoft: 'rgba(109, 74, 255, 0.12)',
    orb: brand.orb,

    positive: mint,
    teal: brand.sky,
    coral: roseLight,
    slate: muted,

    danger: roseLight,

    alertDanger: 'rgba(251, 113, 147, 0.12)',
    alertPositive: 'rgba(94, 224, 160, 0.12)',

    scrim: 'rgba(0, 0, 0, 0.6)',
  };
}

export type Palette = Record<keyof ReturnType<typeof buildDark>, string>;
export type ColorToken = keyof Palette;

const dark: Palette = buildDark();

function buildLight(): Palette {
  const ground = '#F4F3F9';
  const surface = '#FFFFFF';
  const surfaceRaised = '#FFFFFF';
  const line = 'rgba(23, 22, 29, 0.08)';
  const glass = 'rgba(255, 255, 255, 0.88)';
  const text = '#17161D';
  const muted = '#5D5B6A';
  const glow = '#E3DBFF';
  const sunk = '#E9E7F1';
  // Lavender text is unreadable on white; the light designs use indigo for
  // highlights, labels and the active nav item.
  const lavender = brand.indigo;
  const roseLight = brand.rose;
  const mint = '#0D8A54';
  const gold = '#B8862F';

  return {
    ground,
    surface,
    surfaceRaised,
    line,
    glass,
    text,
    muted,
    glow,
    violet: brand.violet,
    lavender,
    indigo: brand.indigo,
    sky: '#2F7FD6',
    rose: brand.rose,
    roseLight,
    mint,
    gold,
    onAccent: '#FFFFFF',
    wash: '#EFEAFF',
    shadow: 'rgba(43, 26, 114, 0.10)',

    canvas: ground,
    sheet: ground,
    field: surface,
    fieldStroke: line,
    googleStroke: 'rgba(23, 22, 29, 0.16)',
    canvasSunk: sunk,
    surfaceNav: glass,
    track: 'rgba(23, 22, 29, 0.07)',
    orbPeach: glow,
    orbSand: '#D3C6FF',

    ink: text,
    inkSecondary: '#3E3C4A',
    inkMuted: muted,
    inkSoft: muted,
    onInk: '#FFFFFF',

    hairline: line,
    hairlineStrong: 'rgba(23, 22, 29, 0.14)',

    accent: brand.violet,
    accentPress: brand.indigo,
    accentSoft: '#EFEAFF',
    orb: brand.orb,

    positive: mint,
    teal: '#2F7FD6',
    coral: roseLight,
    slate: muted,

    danger: roseLight,

    alertDanger: 'rgba(225, 29, 72, 0.08)',
    alertPositive: 'rgba(13, 138, 84, 0.08)',

    scrim: 'rgba(23, 22, 29, 0.45)',
  };
}

const light: Palette = buildLight();

export type ColorScheme = 'dark' | 'light';

export const palettes: Record<ColorScheme, Palette> = {dark, light};

let activeScheme: ColorScheme = 'dark';

/** Set by `ThemeProvider` before its subtree renders. */
export function setActiveScheme(scheme: ColorScheme) {
  activeScheme = scheme;
}

export function getActiveScheme(): ColorScheme {
  return activeScheme;
}

/**
 * Live palette: every property read resolves against the active scheme, so
 * `colors.text` inside a render is always the current theme's text colour.
 */
export const colors: Palette = new Proxy({} as Palette, {
  get: (_target, key) => palettes[activeScheme][key as ColorToken],
  ownKeys: () => Reflect.ownKeys(palettes[activeScheme]),
  getOwnPropertyDescriptor: (_target, key) => ({
    enumerable: true,
    configurable: true,
    value: palettes[activeScheme][key as ColorToken],
  }),
});

/**
 * Gradient stops, first to last. Angles (CSS degrees) the design uses:
 *  - primary      140deg  icon squares, progress fills
 *  - fab          140deg  add button (stops at 0 / 55 / 100%)
 *  - budgetStrip  90deg   home spotlight strip
 *  - savings      140deg  savings / info icon squares and rings
 *  - rose         140deg  dining / over-pace
 * The same brand stops in both schemes. Render with `GradientView` /
 * `linearGradient()` rather than by hand.
 */
export const gradients = {
  primary: [brand.lavender, brand.violet],
  fab: [brand.lavender, brand.violet, brand.indigo],
  budgetStrip: [brand.indigo, brand.violet],
  savings: [brand.sky, brand.indigo],
  rose: [brand.roseLight, brand.rose],
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
