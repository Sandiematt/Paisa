export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  section: 40,
} as const;

/**
 * One radius system for the whole app (DX):
 * pills and segmented controls are fully round, cards are 22-24, inputs 16,
 * quick tiles 18, icon squares 11-12, sheets round their top corners at 28.
 */
export const radii = {
  input: 16,
  chip: 16,
  card: 22,
  cardHero: 24,
  cardMetric: 22,
  tile: 18,
  iconSquare: 12,
  iconSquareSm: 11,
  sheet: 28,
  sheetLogin: 28,
  pill: 999,
} as const;

export const layout = {
  /** DX screen padding is 16. */
  screenPadding: 16,
  controlHeight: 56,
  hairlineWidth: 1,
  navIcon: 22,
  addButton: 60,
} as const;
