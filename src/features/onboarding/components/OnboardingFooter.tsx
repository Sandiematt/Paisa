import React from 'react';
import {View} from 'react-native';

import {GhostButton, PrimaryButton} from '../../../components/ui';
import {colors, layout, makeStyles, spacing} from '../../../theme';

type OnboardingFooterProps = {
  primaryLabel: string;
  onPrimary: () => void;
  /** Shows a spinner on the primary button while the step checks something. */
  loading?: boolean;
  skippable: boolean;
  /** Replaces "Skip for now". */
  skipLabel?: string;
  onSkip: () => void;
};

/**
 * The primary action always stays enabled. A greyed-out button tells the user
 * they are stuck without telling them why; pressing it surfaces the reason
 * inline on the step instead.
 */
export function OnboardingFooter({
  primaryLabel,
  onPrimary,
  loading = false,
  skippable,
  skipLabel = 'Skip for now',
  onSkip,
}: OnboardingFooterProps) {
  const styles = useStyles();
  return (
    <View style={styles.root}>
      <PrimaryButton
        label={primaryLabel}
        trailing={'→'}
        onPress={onPrimary}
        loading={loading}
      />
      {skippable ? (
        <GhostButton label={skipLabel} onPress={onSkip} style={styles.skip} />
      ) : (
        <View style={styles.skipSpacer} />
      )}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.ground,
  },
  skip: {
    marginTop: spacing.xs,
    alignSelf: 'center',
  },
  // Reserving the skip row keeps the primary button from shifting between
  // required and optional steps.
  skipSpacer: {
    height: 46,
  },
}));
