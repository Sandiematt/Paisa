import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {colors, spacing} from '../../theme';
import {AppText} from './AppText';

type DividerLabelProps = {
  label: string;
  style?: StyleProp<ViewStyle>;
};

/** Hairline with a word set into it, separating two ways of doing one thing. */
export function DividerLabel({label, style}: DividerLabelProps) {
  return (
    <View style={[styles.root, style]}>
      <View style={styles.rule} />
      <AppText variant="caption" color={colors.inkMuted} style={styles.label}>
        {label}
      </AppText>
      <View style={styles.rule} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rule: {
    flex: 1,
    height: 1,
    backgroundColor: colors.hairline,
  },
  label: {
    marginHorizontal: spacing.md,
  },
});
