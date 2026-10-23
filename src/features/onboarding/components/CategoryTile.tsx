import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Check} from 'phosphor-react-native';

import {
  AppText,
  GradientIconSquare,
  GradientView,
  PressableScale,
} from '../../../components/ui';
import {GradientKey, colors, radii, spacing, withAlpha} from '../../../theme';

type CategoryTileProps = {
  label: string;
  icon: React.ReactNode;
  gradient: GradientKey;
  selected: boolean;
  onToggle: () => void;
};

/**
 * Multi-select category tile: gradient icon square plus label. Selected =
 * lavender ring, soft lavender wash and a check badge at the trailing edge.
 */
export function CategoryTile({
  label,
  icon,
  gradient,
  selected,
  onToggle,
}: CategoryTileProps) {
  return (
    <PressableScale
      onPress={onToggle}
      scaleTo={0.96}
      accessibilityRole="checkbox"
      accessibilityState={{checked: selected}}
      accessibilityLabel={label}
      containerStyle={styles.cell}
      style={[styles.tile, selected && styles.tileSelected]}>
      <GradientIconSquare size={38} gradient={gradient} glow={selected}>
        {icon}
      </GradientIconSquare>
      <AppText
        variant="bodyStrong"
        numberOfLines={1}
        color={selected ? colors.text : colors.muted}
        style={styles.label}>
        {label}
      </AppText>
      {selected ? (
        <GradientView gradient="primary" style={styles.check}>
          <Check size={12} color={colors.text} weight="bold" />
        </GradientView>
      ) : (
        <View style={styles.check} />
      )}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  cell: {
    width: '48.5%',
  },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderRadius: radii.tile,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  tileSelected: {
    borderColor: colors.lavender,
    backgroundColor: withAlpha(colors.lavender, 0.1),
  },
  label: {
    flex: 1,
    marginLeft: spacing.md,
  },
  check: {
    width: 20,
    height: 20,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
