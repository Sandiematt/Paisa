import React from 'react';
import {StyleProp, View, ViewStyle} from 'react-native';

import {colors, makeStyles, radii} from '../../theme';

type BalanceGlassCardProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Single glass surface: glass fill with a 1px `line` border. */
export function BalanceGlassCard({children, style}: BalanceGlassCardProps) {
  const styles = useStyles();
  return <View style={[styles.shell, style]}>{children}</View>;
}

const useStyles = makeStyles(() => ({
  shell: {
    borderRadius: radii.cardHero,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 22,
  },
}));
