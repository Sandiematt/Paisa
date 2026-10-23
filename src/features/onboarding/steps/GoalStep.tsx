import React from 'react';
import {StyleSheet} from 'react-native';
import {ChartLineUp, PiggyBank, UsersThree} from 'phosphor-react-native';

import {AppText, Stagger} from '../../../components/ui';
import {GradientKey, colors, spacing} from '../../../theme';
import {GOALS, STEP_TITLES} from '../constants';
import {GoalOption} from '../components/GoalOption';
import {StepLayout} from '../components/StepLayout';
import {GoalId} from '../types';

type GoalStepProps = {
  value: GoalId | null;
  error?: string;
  onSelect: (goal: GoalId) => void;
};

const ICON_SIZE = 22;

const GOAL_VISUALS: Record<
  GoalId,
  {gradient: GradientKey; icon: React.ReactNode}
> = {
  track: {
    gradient: 'primary',
    icon: <ChartLineUp size={ICON_SIZE} color={colors.text} weight="bold" />,
  },
  save: {
    gradient: 'savings',
    icon: <PiggyBank size={ICON_SIZE} color={colors.text} weight="bold" />,
  },
  split: {
    gradient: 'rose',
    icon: <UsersThree size={ICON_SIZE} color={colors.text} weight="bold" />,
  },
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
          <GoalOption
            title={goal.title}
            description={goal.description}
            gradient={GOAL_VISUALS[goal.id].gradient}
            icon={GOAL_VISUALS[goal.id].icon}
            selected={value === goal.id}
            onSelect={() => onSelect(goal.id)}
          />
        </Stagger>
      ))}

      {error ? (
        <AppText variant="caption" color={colors.roseLight} style={styles.error}>
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
