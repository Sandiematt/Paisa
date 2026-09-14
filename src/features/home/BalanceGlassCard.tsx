import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';

import {colors, radii} from '../../theme';

type BalanceGlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Single glass surface — no inner glow, sheen, or nested wrapper. */
export function BalanceGlassCard({children, style}: BalanceGlassCardProps) {
  return <View style={[styles.shell, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radii.cardHero,
    backgroundColor: colors.glass,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairlineStrong,
    padding: 22,
  },
});
