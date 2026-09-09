import React from 'react';
import {StyleSheet, View} from 'react-native';

import {layout, spacing} from '../../theme';
import {BACK_BUTTON_SIZE, BackButton} from './BackButton';

type ScreenHeaderProps = {
  /** Omitted on the root screen, where there is nowhere to go back to. */
  onBack?: () => void;
};

/** Back affordance row for the non-wizard screens. */
export function ScreenHeader({onBack}: ScreenHeaderProps) {
  return (
    <View style={styles.root}>
      {onBack ? <BackButton onPress={onBack} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    height: BACK_BUTTON_SIZE,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    marginTop: spacing.md,
  },
});
