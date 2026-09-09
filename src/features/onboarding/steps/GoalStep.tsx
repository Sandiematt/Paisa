import React from 'react';
import {StyleSheet} from 'react-native';

import {AppText, SelectCard, Stagger} from '../../../components/ui';
import {colors, spacing} from '../../../theme';
import {GOALS, STEP_TITLES} from '../constants';
import {StepLayout} from '../components/StepLayout';
import {GoalId} from '../types';

type GoalStepProps = {
  value: GoalId | null;
  error?: string;
  onSelect: (goal: GoalId) => void;
};

export function GoalStep({value, error, onSelect}: GoalStepProps) {
  const copy = STEP_TITLES.goal;

  return (
    <StepLayout title={copy.title} subtitle={copy.subtitle}>
      {GOALS.map((goal, index) => (
        <Stagger
          key={goal.id}
          index={index + 1}
          style={index > 0 ? styles.spaced : undefined}>
          <SelectCard
            title={goal.title}
            description={goal.description}
            accent={goal.accent}
            selected={value === goal.id}
            onSelect={() => onSelect(goal.id)}
          />
        </Stagger>
      ))}

      {error ? (
        <AppText variant="caption" color={colors.danger} style={styles.error}>
          {error}
        </AppText>
      ) : null}
    </StepLayout>
  );
}

const styles = StyleSheet.create({
  spaced: {
    marginTop: spacing.md,
  },
  error: {
    marginTop: spacing.lg,
  },
});
