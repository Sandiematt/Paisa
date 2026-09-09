import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

import {colors, duration, easing, radii, spacing} from '../../theme';
import {useReducedMotion} from '../../hooks/useReducedMotion';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type SelectCardProps = {
  title: string;
  description: string;
  accent: string;
  selected: boolean;
  onSelect: () => void;
};

/** Single-choice row used for the goal step. Radio semantics, card surface. */
export function SelectCard({
  title,
  description,
  accent,
  selected,
  onSelect,
}: SelectCardProps) {
  const reducedMotion = useReducedMotion();
  const fill = useRef(new Animated.Value(selected ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(fill, {
      toValue: selected ? 1 : 0,
      duration: reducedMotion ? 0 : duration.swap,
      easing: easing.out,
      useNativeDriver: true,
    }).start();
  }, [fill, reducedMotion, selected]);

  return (
    <PressableScale
      onPress={onSelect}
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{selected}}
      style={[styles.card, selected && styles.cardSelected]}>
      <View style={[styles.rail, {backgroundColor: accent}]} />

      <View style={styles.copy}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="body" color={colors.inkSecondary} style={styles.desc}>
          {description}
        </AppText>
      </View>

      <View style={[styles.ring, selected && styles.ringSelected]}>
        <Animated.View
          style={[styles.ringFill, {transform: [{scale: fill}], opacity: fill}]}
        />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.xl,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: colors.accent,
  },
  rail: {
    width: 4,
    height: 40,
    borderRadius: radii.pill,
    marginRight: spacing.lg,
  },
  copy: {
    flex: 1,
    paddingRight: spacing.lg,
  },
  desc: {
    marginTop: 2,
  },
  ring: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    borderWidth: 1.5,
    borderColor: colors.hairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringSelected: {
    borderColor: colors.accent,
  },
  ringFill: {
    width: 13,
    height: 13,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
  },
});
