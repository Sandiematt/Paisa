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
 * One radius system for the whole app, documented so it stays consistent:
 * interactive pills are fully rounded, cards are 20, inputs and chips are 14.
 */
export const radii = {
  input: 14,
  chip: 14,
  card: 20,
  sheet: 28,
  pill: 999,
} as const;

export const layout = {
  screenPadding: spacing.xxl,
  controlHeight: 56,
  hairlineWidth: 1,
} as const;
