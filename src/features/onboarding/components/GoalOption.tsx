import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Check} from 'phosphor-react-native';

import {
  AppText,
  GradientIconSquare,
  GradientView,
  PressableScale,
} from '../../../components/ui';
import {GradientKey, colors, radii, spacing} from '../../../theme';

type GoalOptionProps = {
  title: string;
  description: string;
  icon: React.ReactNode;
  gradient: GradientKey;
  selected: boolean;
  onSelect: () => void;
};

/**
 * Single-choice goal row: surface card, gradient icon square, radio check.
 * Selected = lavender ring and a violet check; radio semantics for a11y.
 */
export function GoalOption({
  title,
  description,
  icon,
  gradient,
  selected,
  onSelect,
}: GoalOptionProps) {
  return (
    <PressableScale
      onPress={onSelect}
      scaleTo={0.98}
      accessibilityRole="radio"
      accessibilityState={{selected}}
      accessibilityLabel={`${title}. ${description}`}
      style={[styles.card, selected && styles.cardSelected]}>
      <GradientIconSquare size={44} gradient={gradient} glow={selected}>
        {icon}
      </GradientIconSquare>

      <View style={styles.copy}>
        <AppText variant="heading">{title}</AppText>
        <AppText variant="body" color={colors.muted} style={styles.desc}>
          {description}
        </AppText>
      </View>

      {selected ? (
        <GradientView gradient="primary" style={styles.check}>
          <Check size={14} color={colors.text} weight="bold" />
        </GradientView>
      ) : (
        <View style={styles.ring} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  cardSelected: {
    borderColor: colors.lavender,
  },
  copy: {
    flex: 1,
    paddingHorizontal: spacing.lg,
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
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
