import {ArrowsClockwise, CloudArrowDown, X} from 'phosphor-react-native';
import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {AppText, BannerPill, PressableScale} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  colors,
  duration,
  easing,
  makeStyles,
  radii,
  shadows,
  spacing,
} from '../../theme';
import {OtaUpdate} from './useOtaUpdate';

type UpdateBannerProps = OtaUpdate & {
  /** Held back while the launch splash is up. */
  visible?: boolean;
};

/**
 * Floating pill under the status bar for an over-the-air update. While the
 * bundle downloads it says so quietly; once it is staged it offers Restart.
 * Closing it is always fine: the update applies on the next cold start.
 */
export function UpdateBanner({
  status,
  dismissed,
  restart,
  dismiss,
  visible = true,
}: UpdateBannerProps) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const show = useRef(new Animated.Value(0)).current;
  const [restarting, setRestarting] = useState(false);

  const wanted =
    visible && !dismissed && (status === 'downloading' || status === 'ready');
  // Keep the last shown state on screen while the pill animates out.
  const [shown, setShown] = useState<'downloading' | 'ready' | null>(null);

  useEffect(() => {
    if (wanted) {
      setShown(status as 'downloading' | 'ready');
    }
  }, [wanted, status]);

  useEffect(() => {
    const anim = Animated.timing(show, {
      toValue: wanted ? 1 : 0,
      duration: wanted ? duration.overlay : duration.enter,
      easing: wanted ? easing.out : easing.screen,
      useNativeDriver: true,
    });
    anim.start(({finished}) => {
      if (finished && !wanted) {
        setShown(null);
      }
    });
    return () => anim.stop();
  }, [show, wanted]);

  useEffect(() => {
    if (wanted && status === 'ready') {
      AccessibilityInfo.announceForAccessibility(
        'An update is ready. Restart Paisa to use it.',
      );
    }
  }, [wanted, status]);

  if (!shown) {
    return null;
  }

  const ready = shown === 'ready';
  const onRestart = () => {
    if (restarting) {
      return;
    }
    setRestarting(true);
    restart().finally(() => setRestarting(false));
  };

  return (
    <Animated.View
      pointerEvents={wanted ? 'box-none' : 'none'}
      style={[
        styles.dock,
        {top: insets.top + spacing.sm},
        {
          opacity: show,
          transform: [
            {
              translateY: show.interpolate({
                inputRange: [0, 1],
                outputRange: [reducedMotion ? 0 : -24, 0],
              }),
            },
          ],
        },
      ]}>
      <BannerPill
        style={[styles.pill, shadows.card]}
        iconGradient={ready ? 'primary' : 'savings'}
        icon={
          ready ? (
            <ArrowsClockwise size={20} color={colors.onAccent} weight="bold" />
          ) : (
            <CloudArrowDown size={20} color={colors.onAccent} weight="bold" />
          )
        }
        title={ready ? 'Update ready' : 'Downloading update'}
        subtitle={
          ready
            ? 'Restart to get the latest Paisa.'
            : 'You can keep going, this runs in the background.'
        }
        trailing={
          <View style={styles.actions}>
            {ready ? (
              <PressableScale
                onPress={onRestart}
                disabled={restarting}
                scaleTo={0.94}
                accessibilityRole="button"
                accessibilityLabel="Restart Paisa to apply the update"
                accessibilityState={{disabled: restarting, busy: restarting}}
                style={styles.restart}>
                <AppText variant="label" color={colors.onAccent}>
                  {restarting ? 'Restarting' : 'Restart'}
                </AppText>
              </PressableScale>
            ) : null}
            <PressableScale
              onPress={dismiss}
              scaleTo={0.9}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={
                ready ? 'Later, apply the update next launch' : 'Hide'
              }
              style={styles.close}>
              <X size={16} color={colors.muted} weight="bold" />
            </PressableScale>
          </View>
        }
      />
    </Animated.View>
  );
}

const useStyles = makeStyles(() => ({
  dock: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    zIndex: 40,
    elevation: 40,
  },
  pill: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.hairlineStrong,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  restart: {
    paddingVertical: spacing.sm,
    paddingHorizontal: 14,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
  close: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasSunk,
  },
}));
