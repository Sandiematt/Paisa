import React, {useEffect, useRef, useState} from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  LayoutChangeEvent,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AppText, PressableScale} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  brand,
  colors,
  duration,
  easing,
  layout,
  makeStyles,
  radii,
  shadows,
  spacing,
} from '../../theme';
import type {Measurement} from './TutorialProvider';
import {placeCard, Rect, TutorialStep, visibleRect} from './tutorialSteps';

type TutorialOverlayProps = {
  step: TutorialStep;
  index: number;
  total: number;
  /** The latest spotlight; it may still be for the previous step. */
  measurement: Measurement | null;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
  onFinish: () => void;
};

type Shown = {
  step: TutorialStep;
  index: number;
  total: number;
  hole: Rect | null;
};

const SPOT_PAD = 6;
const SCRIM = 'rgba(5, 5, 8, 0.78)';
// Used until the card has measured itself.
const CARD_ESTIMATE = 200;

export function TutorialOverlay({
  step,
  index,
  total,
  measurement,
  onNext,
  onBack,
  onSkip,
  onFinish,
}: TutorialOverlayProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const [cardHeight, setCardHeight] = useState(CARD_ESTIMATE);
  // What is on screen. It moves to a new step only once that step's
  // spotlight is measured, so Next swaps content in place with no blank frame.
  const [shown, setShown] = useState<Shown | null>(null);
  const pending = shown?.step.id !== step.id;

  useEffect(() => {
    if (measurement?.stepId !== step.id) {
      return;
    }
    const spot = visibleRect(measurement.rect, screen);
    setShown({
      step,
      index,
      total,
      hole: spot
        ? {
            x: Math.max(0, spot.x - SPOT_PAD),
            y: Math.max(0, spot.y - SPOT_PAD),
            width: spot.width + SPOT_PAD * 2,
            height: spot.height + SPOT_PAD * 2,
          }
        : null,
    });
  }, [index, measurement, screen, step, total]);

  // Fades in once, when the tips first appear; later steps swap in place.
  const appeared = shown !== null;
  useEffect(() => {
    if (!appeared) {
      return;
    }
    Animated.timing(fade, {
      toValue: 1,
      duration: reducedMotion ? 0 : duration.enter,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [appeared, fade, reducedMotion]);

  useEffect(() => {
    if (shown) {
      AccessibilityInfo.announceForAccessibility?.(
        `Step ${shown.index + 1} of ${shown.total}. ${shown.step.title}. ${
          shown.step.body
        }`,
      );
    }
  }, [shown]);

  // Android back steps back through the tips, and skips them from the start.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (index > 0) {
          onBack();
        } else {
          onSkip();
        }
        return true;
      },
    );
    return () => subscription.remove();
  }, [index, onBack, onSkip]);

  const onCardLayout = (event: LayoutChangeEvent) => {
    const height = Math.round(event.nativeEvent.layout.height);
    if (Math.abs(height - cardHeight) > 1) {
      setCardHeight(height);
    }
  };

  if (!shown) {
    // Block touches while the first spotlight is measured; nothing is drawn yet.
    return <View style={styles.layer} />;
  }

  const {hole} = shown;
  const last = shown.index === shown.total - 1;
  const {top} = placeCard(hole, screen.height, cardHeight, insets);
  // Ignore taps in the moment between pressing and the next step landing.
  const guard = (action: () => void) => () => {
    if (!pending) {
      action();
    }
  };

  return (
    <View style={styles.layer} accessibilityViewIsModal>
      {/* The scrim is four panels around the hole, so the target shows through. */}
      {hole ? (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, {opacity: fade}]}>
          <View style={[styles.scrim, styles.scrimTop, {height: hole.y}]} />
          <View
            style={[
              styles.scrim,
              styles.scrimBottom,
              {top: hole.y + hole.height},
            ]}
          />
          <View
            style={[
              styles.scrim,
              styles.scrimLeft,
              {top: hole.y, width: hole.x, height: hole.height},
            ]}
          />
          <View
            style={[
              styles.scrim,
              styles.scrimRight,
              {top: hole.y, left: hole.x + hole.width, height: hole.height},
            ]}
          />
          <View
            style={[
              styles.ring,
              {
                left: hole.x,
                top: hole.y,
                width: hole.width,
                height: hole.height,
              },
            ]}
          />
        </Animated.View>
      ) : (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.scrim, {opacity: fade}]}
        />
      )}

      <Animated.View
        onLayout={onCardLayout}
        style={[styles.card, {top, opacity: fade}]}
        accessibilityLiveRegion="polite">
        {shown.total > 1 ? (
          <AppText variant="caption" color={colors.lavender}>
            {`${shown.index + 1} of ${shown.total}`}
          </AppText>
        ) : null}
        <AppText
          variant="heading"
          color={colors.text}
          accessibilityRole="header">
          {shown.step.title}
        </AppText>
        <AppText variant="body" color={colors.inkSecondary}>
          {shown.step.body}
        </AppText>

        <View
          style={[styles.dots, shown.total < 2 && styles.hidden]}
          accessible={false}>
          {Array.from({length: shown.total}, (_, dot) => (
            <View
              key={dot}
              style={[styles.dot, dot === shown.index && styles.dotOn]}
            />
          ))}
        </View>

        <View style={styles.actions}>
          {last ? (
            <View style={styles.flex} />
          ) : (
            <PressableScale
              onPress={guard(onSkip)}
              scaleTo={0.96}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Skip tour"
              style={styles.textButton}>
              <AppText variant="label" color={colors.muted}>
                Skip
              </AppText>
            </PressableScale>
          )}
          {last ? null : <View style={styles.flex} />}
          {shown.index > 0 ? (
            <PressableScale
              onPress={guard(onBack)}
              scaleTo={0.96}
              accessibilityRole="button"
              accessibilityLabel="Previous step"
              style={[styles.pill, styles.pillGhost]}>
              <AppText variant="label" color={colors.text}>
                Back
              </AppText>
            </PressableScale>
          ) : null}
          <PressableScale
            onPress={guard(last ? onFinish : onNext)}
            scaleTo={0.96}
            accessibilityRole="button"
            accessibilityLabel={last ? 'Finish tour' : 'Next step'}
            style={[styles.pill, styles.pillPrimary]}>
            <AppText variant="label" color={colors.onAccent}>
              {last ? 'Finish' : 'Next'}
            </AppText>
          </PressableScale>
        </View>
      </Animated.View>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 40,
    elevation: 40,
  },
  scrim: {
    position: 'absolute',
    backgroundColor: SCRIM,
  },
  scrimTop: {
    top: 0,
    left: 0,
    right: 0,
  },
  scrimBottom: {
    left: 0,
    right: 0,
    bottom: 0,
  },
  scrimLeft: {
    left: 0,
  },
  scrimRight: {
    right: 0,
  },
  ring: {
    position: 'absolute',
    borderRadius: radii.tile,
    borderWidth: 2,
    // Drawn on the fixed dark scrim, so the brand lavender in both schemes
    // (the light palette's lavender is indigo, which vanishes on it).
    borderColor: brand.lavender,
  },
  card: {
    position: 'absolute',
    left: layout.screenPadding,
    right: layout.screenPadding,
    padding: spacing.lg,
    gap: spacing.sm,
    borderRadius: radii.cardHero,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadows.nav,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginTop: spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.track,
  },
  hidden: {
    display: 'none',
  },
  dotOn: {
    width: 18,
    backgroundColor: colors.lavender,
  },
  actions: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  flex: {
    flex: 1,
  },
  textButton: {
    paddingVertical: spacing.sm,
    paddingRight: spacing.sm,
  },
  pill: {
    minHeight: 40,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillGhost: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  pillPrimary: {
    backgroundColor: colors.violet,
  },
}));
