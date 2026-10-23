import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {colors, radii} from '../../theme';

type BalanceGlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Single glass surface: glass fill with a 1px `line` border. */
export function BalanceGlassCard({children, style}: BalanceGlassCardProps) {
  return <View style={[styles.shell, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.cardHero,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
  },
});
