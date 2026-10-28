import React, {useEffect, useRef} from 'react';
import {
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import {AppText, PressableScale, TileLottieIcon} from '../../components/ui';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {
  useFloatingNavDockHeight,
} from '../NavBar/FloatingNavScroll';
import {colors, duration, easing, radii, spacing, withAlpha} from '../../theme';
import {AddChoice} from './types';

type AddActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (choice: AddChoice) => void;
};

const CARD_WIDTH = 264;
const CARET_GAP = 12;
const ROW_HEIGHT = 60;
/** The nav row pads 24 each side; the add button is the right-most item. */
const SIDE_INSET = spacing.xxl;

const OPTIONS: {
  kind: AddChoice;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    kind: 'income',
    title: 'Add income',
    description: 'Record money coming in',
    accent: colors.mint,
  },
  {
    kind: 'expense',
    title: 'Add expense',
    description: 'Record money going out',
    accent: colors.roseLight,
  },
  {
    kind: 'scan',
    title: 'Scan receipt',
    description: 'Read a bill or receipt from a photo',
    accent: colors.lavender,
  },
];

export function AddActionSheet({
  visible,
  onClose,
  onSelect,
}: AddActionSheetProps) {
  const dockHeight = useFloatingNavDockHeight();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : duration.enter,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [progress, reducedMotion, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onClose();
        return true;
      },
    );
    return () => subscription.remove();
  }, [onClose, visible]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [12, 0],
  });
  const scale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.94, 1],
  });

  return (
    <View
      style={styles.layer}
      pointerEvents={visible ? 'auto' : 'none'}
      collapsable={false}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.scrim, {opacity: progress}]}
      />
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss add menu"
      />

      <Animated.View
        pointerEvents={visible ? 'box-none' : 'none'}
        style={[
          styles.cluster,
          {
            bottom: dockHeight + CARET_GAP,
            opacity: progress,
            transform: [{translateY}, {scale}],
          },
        ]}>
        <View style={styles.card}>
          {OPTIONS.map((option, index) => (
            <React.Fragment key={option.kind}>
              {index > 0 ? <View style={styles.divider} /> : null}
              <PressableScale
                onPress={() => onSelect(option.kind)}
                scaleTo={0.98}
                accessibilityRole="button"
                accessibilityLabel={option.title}
                accessibilityHint={option.description}
                style={styles.row}>
                <View
                  style={[
                    styles.mark,
                    {
                      backgroundColor: withAlpha(option.accent, 0.14),
                      borderColor: withAlpha(option.accent, 0.3),
                    },
                  ]}>
                  <TileLottieIcon
                    kind={option.kind === 'scan' ? 'receipt' : option.kind}
                    size={20}
                    color={option.accent}
                    replayKey={visible}
                  />
                </View>
                <View style={styles.copy}>
                  <AppText variant="heading" color={colors.text}>
                    {option.title}
                  </AppText>
                  <AppText variant="caption" color={colors.muted}>
                    {option.description}
                  </AppText>
                </View>
              </PressableScale>
            </React.Fragment>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 20,
  },
  scrim: {
    backgroundColor: colors.scrim,
  },
  cluster: {
    position: 'absolute',
    right: SIDE_INSET,
    width: CARD_WIDTH,
    transformOrigin: 'bottom right',
  },
  // No shadow: the scrim already lifts the card, and Android's elevation
  // shadow ignores the fade-in opacity, so it popped in as a dark box.
  card: {
    padding: spacing.sm,
    borderRadius: radii.cardHero,
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: {
    height: ROW_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: spacing.sm,
    paddingRight: spacing.md,
    borderRadius: radii.tile,
    gap: spacing.md,
  },
  mark: {
    width: 40,
    height: 40,
    borderRadius: radii.iconSquare,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginVertical: 2,
    marginHorizontal: spacing.sm,
  },
});
