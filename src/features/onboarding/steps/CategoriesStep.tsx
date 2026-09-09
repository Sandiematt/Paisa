import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText, Chip, Stagger} from '../../../components/ui';
import {colors, spacing} from '../../../theme';
import {CATEGORIES, MIN_CATEGORIES, STEP_TITLES} from '../constants';
import {StepLayout} from '../components/StepLayout';

type CategoriesStepProps = {
  selectedIds: string[];
  error?: string;
  onToggle: (id: string) => void;
};

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
        <View style={styles.chips}>
          {CATEGORIES.map(category => (
            <Chip
              key={category.id}
              label={category.label}
              dotColor={category.color}
              selected={selectedIds.includes(category.id)}
              onToggle={() => onToggle(category.id)}
            />
          ))}
        </View>
      </Stagger>

      <Stagger index={2} style={styles.status}>
        <AppText
          variant="caption"
          color={error ? colors.danger : colors.inkMuted}>
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
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  status: {
    marginTop: spacing.xl,
  },
});
