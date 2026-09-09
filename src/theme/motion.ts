import {Easing} from 'react-native';

/**
 * Motion tokens. Every animation in the app pulls its curve and duration from
 * here so nothing gets approximated at the call site.
 *
 * `easeIn` is deliberately absent: it delays the first frame, which is the
 * exact moment the user is watching. UI motion enters and exits on ease-out.
 */
export const easing = {
  /** Strong ease-out. Default for anything entering or leaving. */
  out: Easing.bezier(0.23, 1, 0.32, 1),
  /** Strong ease-in-out. For elements moving or morphing on screen. */
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  /** Softer curve for hover/colour changes and small state swaps. */
  standard: Easing.bezier(0.25, 0.1, 0.25, 1),
  /**
   * Material standard easing, for whole-surface travel.
   *
   * The tail-heavy curves above cover most of their distance in the first
   * third of the time and then barely move, so a long duration just adds
   * dead time at the end. This one spreads velocity across the whole
   * duration, which is what makes a slow transition read as slow rather
   * than as a quick slide with a lazy settle.
   */
  screen: Easing.bezier(0.4, 0, 0.2, 1),
  linear: Easing.linear,
} as const;

export const duration = {
  press: 120,
  swap: 150,
  exit: 150,
  control: 200,
  enter: 280,
  overlay: 320,

  /**
   * Screen and wizard-step swaps. Deliberately longer than in-page motion:
   * the whole surface is travelling, so it needs room to read as a glide.
   * The exit sits close to the enter on purpose, so both screens stay on
   * stage for most of the travel and the handover reads as one movement.
   */
  screenExit: 460,
  screenEnter: 560,

  /** First-launch reveal. Only plays when nothing else is moving. */
  reveal: 360,
} as const;

/** Gentle settle for selection feedback. Bounce stays low on purpose. */
export const spring = {
  select: {tension: 320, friction: 18},
  celebrate: {tension: 170, friction: 12},
} as const;

/**
 * Distance content travels when it swaps. Scaled up alongside the longer
 * durations: slow motion over a short distance creeps, slow motion over a
 * proportionate distance glides.
 */
export const travel = {
  reveal: 16,
  step: 44,
  screen: 80,
} as const;

/** Delay between staggered items. */
export const staggerStep = 60;
