import React from 'react';
import {StyleSheet, View} from 'react-native';
import {
  Airplane,
  Basket,
  Bus,
  Receipt,
  Repeat,
  ForkKnife,
  GraduationCap,
  Heartbeat,
  House,
  ShoppingBag,
} from 'phosphor-react-native';

import {AppText, Stagger} from '../../../components/ui';
import {GradientKey, colors, spacing} from '../../../theme';
import {CATEGORIES, MIN_CATEGORIES, STEP_TITLES} from '../constants';
import {CategoryTile} from '../components/CategoryTile';
import {StepLayout} from '../components/StepLayout';

type CategoriesStepProps = {
  selectedIds: string[];
  error?: string;
  onToggle: (id: string) => void;
};

const ICON_SIZE = 20;

function glyph(Icon: typeof House) {
  return <Icon size={ICON_SIZE} color={colors.text} weight="bold" />;
}

/** Icon and gradient per preset id; presets keep their own colour for charts. */
const VISUALS: Record<string, {gradient: GradientKey; icon: React.ReactNode}> = {
  housing: {gradient: 'primary', icon: glyph(House)},
  dining: {gradient: 'rose', icon: glyph(ForkKnife)},
  groceries: {gradient: 'savings', icon: glyph(Basket)},
  shopping: {gradient: 'primary', icon: glyph(ShoppingBag)},
  transport: {gradient: 'savings', icon: glyph(Bus)},
  bills: {gradient: 'primary', icon: glyph(Receipt)},
  health: {gradient: 'rose', icon: glyph(Heartbeat)},
  travel: {gradient: 'savings', icon: glyph(Airplane)},
  subscriptions: {gradient: 'primary', icon: glyph(Repeat)},
  education: {gradient: 'savings', icon: glyph(GraduationCap)},
};

const FALLBACK = VISUALS.bills;

export function CategoriesStep({
  selectedIds,
  error,
  onToggle,
}: CategoriesStepProps) {
  const copy = STEP_TITLES.categories;
  const remaining = Math.max(0, MIN_CATEGORIES - selectedIds.length);

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      <Stagger index={1}>
        <View style={styles.grid}>
          {CATEGORIES.map(category => {
            const visual = VISUALS[category.id] ?? FALLBACK;
            return (
              <CategoryTile
                key={category.id}
                label={category.label}
                icon={visual.icon}
                gradient={visual.gradient}
                selected={selectedIds.includes(category.id)}
                onToggle={() => onToggle(category.id)}
              />
            );
          })}
        </View>
      </Stagger>

      <Stagger index={2} style={styles.status}>
        <AppText
          variant="caption"
          color={error ? colors.roseLight : colors.muted}>
          {error ??
            (remaining > 0
              ? `${remaining} more to go.`
              : `${selectedIds.length} selected.`)}
        </AppText>
      </Stagger>
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  status: {
    marginTop: spacing.xl,
  },
});
