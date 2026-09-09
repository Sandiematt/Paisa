import React from 'react';
import {StyleSheet, View} from 'react-native';

import {GhostButton, PrimaryButton} from '../../../components/ui';
import {colors, layout, spacing} from '../../../theme';

type OnboardingFooterProps = {
  primaryLabel: string;
  onPrimary: () => void;
  skippable: boolean;
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
  skippable,
  onSkip,
}: OnboardingFooterProps) {
  return (
    <View style={styles.root}>
      <PrimaryButton
        label={primaryLabel}
        trailing={'\u2192'}
        onPress={onPrimary}
      />
      {skippable ? (
        <GhostButton label="Skip for now" onPress={onSkip} style={styles.skip} />
      ) : (
        <View style={styles.skipSpacer} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    backgroundColor: colors.canvas,
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
});
