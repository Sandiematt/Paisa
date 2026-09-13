import React, { useEffect, useRef } from 'react';
import {
  Animated,
  BackHandler,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MoneyInGlyph, MoneyOutGlyph } from '../../components/icons/Glyphs';
import { AppText, PressableScale } from '../../components/ui';
import { useReducedMotion } from '../../hooks/useReducedMotion';
import { colors, duration, easing, layout, radii, spacing } from '../../theme';
import { AddKind } from './types';

type AddActionSheetProps = {
  visible: boolean;
  onClose: () => void;
  onSelect: (kind: AddKind) => void;
};

const OPTIONS: {
  kind: AddKind;
  title: string;
  description: string;
  accent: string;
  accentSoft: string;
}[] = [
  {
    kind: 'expense',
    title: 'Add expense',
    description: 'Capture a purchase, bill, fee, or cash spend.',
    accent: colors.coral,
    accentSoft: '#FCE9E4',
  },
  {
    kind: 'income',
    title: 'Add income',
    description: 'Record salary, refunds, transfers, or side income.',
    accent: colors.positive,
    accentSoft: colors.alertPositive,
  },
];

export function AddActionSheet({
  visible,
  onClose,
  onSelect,
}: AddActionSheetProps) {
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: reducedMotion ? 0 : duration.overlay,
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
    outputRange: [28, 0],
  });

  return (
    <View
      style={styles.layer}
      pointerEvents={visible ? 'auto' : 'none'}
      collapsable={false}
    >
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <Animated.View style={[styles.scrim, { opacity: progress }]} />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          {
            paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.md,
            opacity: progress,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.handle} />
        <View style={styles.header}>
          <AppText variant="title" style={styles.title}>
            Add transaction
          </AppText>
          <AppText variant="body" color={colors.inkSecondary}>
            Choose the flow that matches the money movement.
          </AppText>
        </View>

        <View style={styles.options}>
          {OPTIONS.map((option, index) => (
            <PressableScale
              key={option.kind}
              onPress={() => onSelect(option.kind)}
              scaleTo={0.98}
              accessibilityRole="button"
              accessibilityLabel={option.title}
              style={[
                styles.option,
                index < OPTIONS.length - 1 && styles.optionGap,
                { borderColor: option.accentSoft },
              ]}
            >
              <View
                style={[
                  styles.mark,
                  {
                    backgroundColor: option.accentSoft,
                    borderColor: option.accent,
                  },
                ]}
              >
                {option.kind === 'income' ? (
                  <MoneyInGlyph color={option.accent} size={20} />
                ) : (
                  <MoneyOutGlyph color={option.accent} size={20} />
                )}
              </View>
              <View style={styles.optionCopy}>
                <AppText variant="heading">{option.title}</AppText>
                <AppText
                  variant="body"
                  color={colors.inkSecondary}
                  style={styles.optionDesc}
                >
                  {option.description}
                </AppText>
              </View>
              <AppText variant="heading" color={colors.inkMuted}>
                {'›'}
              </AppText>
            </PressableScale>
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
    justifyContent: 'flex-end',
    zIndex: 20,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(21, 20, 18, 0.28)',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    shadowColor: colors.ink,
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -8 },
    elevation: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.hairlineStrong,
    marginBottom: spacing.xl,
  },
  header: {
    marginBottom: spacing.xl,
  },
  title: {
    marginBottom: spacing.xs,
  },
  options: {
    flexDirection: 'column',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.sheet,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    shadowColor: colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  optionGap: {
    marginBottom: spacing.md,
  },
  mark: {
    width: 44,
    height: 44,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.lg,
  },
  optionCopy: {
    flex: 1,
    paddingRight: spacing.md,
  },
  optionDesc: {
    marginTop: 2,
  },
});
