import React from 'react';
import {View} from 'react-native';

import {
  AppText,
  BACK_BUTTON_SIZE,
  BackButton,
  ProgressBar,
} from '../../../components/ui';
import {colors, layout, makeStyles, spacing} from '../../../theme';

type OnboardingHeaderProps = {
  stepIndex: number;
  stepCount: number;
  progress: number;
  canGoBack: boolean;
  onBack: () => void;
};

export function OnboardingHeader({
  stepIndex,
  stepCount,
  progress,
  canGoBack,
  onBack,
}: OnboardingHeaderProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <View style={styles.row}>
        {/* The first step has nothing to go back to, so the slot is held open
            rather than filled: the step counter must not shift sideways when
            the button appears on step two. */}
        {canGoBack ? <BackButton onPress={onBack} /> : <View style={styles.slot} />}

        <AppText variant="label" color={colors.muted}>
          Step{' '}
          <AppText variant="bodyStrong" color={colors.text}>
            {stepIndex + 1}
          </AppText>{' '}
          of {stepCount}
        </AppText>
      </View>

      <ProgressBar progress={progress} gradient="primary" height={6} />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  slot: {
    width: BACK_BUTTON_SIZE,
    height: BACK_BUTTON_SIZE,
  },
}));
