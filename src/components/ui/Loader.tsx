import React from 'react';
import {StyleProp, View, ViewStyle} from 'react-native';
import LottieView from 'lottie-react-native';

import {colors, makeStyles, useTheme} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {AppText} from './AppText';
import {tintLottie} from './LottieIcons';

const SOURCE = require('../../../assets/animations/loading.json');

const tinted = new Map<string, typeof SOURCE>();

/** Repaints the document itself; `colorFilters` washes it out on device. */
function sourceFor(color: string | undefined) {
  if (!color) {
    return SOURCE;
  }
  let source = tinted.get(color);
  if (!source) {
    source = tintLottie(SOURCE, color);
    tinted.set(color, source);
  }
  return source;
}

/** The artwork fills only the middle of its 300 canvas, so it is drawn larger. */
const CANVAS_SCALE = 1.5;
/** A frame where the coin and money are both in view, for reduce-motion. */
const STILL_PROGRESS = 0.4;

type LoaderProps = {
  /** Visible size of the animation. */
  size?: number;
  /** Recolours the artwork. Default: as drawn (white) on dark, `text` on light. */
  color?: string;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

/**
 * The app's one loading animation (white on dark, ink on light, looping). Everything that waits on
 * data or a save uses this, so a spinner never differs from screen to screen.
 * With reduced motion it holds a still frame instead of looping.
 */
export function Loader({size = 48, color, style, accessibilityLabel}: LoaderProps) {
  const styles = useStyles();
  const {scheme} = useTheme();
  const reducedMotion = useReducedMotion();
  // The artwork is white for the dark ground; on light it is inked instead.
  const tint = color ?? (scheme === 'light' ? colors.text : undefined);
  const drawn = Math.round(size * CANVAS_SCALE);
  return (
    <View
      style={[styles.slot, {width: size, height: size}, style]}
      accessible={accessibilityLabel != null}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{busy: true}}>
      <LottieView
        source={sourceFor(tint)}
        autoPlay={!reducedMotion}
        loop
        progress={reducedMotion ? STILL_PROGRESS : undefined}
        style={{width: drawn, height: drawn}}
      />
    </View>
  );
}

type LoadingStateProps = {
  /** Announced to screen readers and shown beneath the animation when `caption`. */
  label: string;
  caption?: boolean;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/** Centred loader for a screen or section that has nothing to show yet. */
export function LoadingState({label, caption = false, size = 96, style}: LoadingStateProps) {
  const styles = useStyles();
  return (
    <View
      style={[styles.state, style]}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityState={{busy: true}}>
      <Loader size={size} />
      {caption ? (
        <AppText variant="caption" align="center">
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  state: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 40,
  },
}));
