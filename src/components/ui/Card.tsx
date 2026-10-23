import React from 'react';
import {StyleProp, StyleSheet, View, ViewProps, ViewStyle} from 'react-native';

import {colors, radii, spacing} from '../../theme';

type CardProps = ViewProps & {
  /** Corner radius. DX cards are 22 to 24; tiles are 18. Default 22. */
  radius?: number;
  /** Inner padding. Default 16. Pass 0 for edge-to-edge content. */
  padding?: number;
  /** Use `surfaceRaised` instead of `surface`. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
};

/** Surface card with a 1px `line` border. The basic DX container. */
export function Card({
  radius = radii.card,
  padding = spacing.lg,
  raised = false,
  style,
  children,
  ...rest
}: CardProps) {
  return (
    <View
      {...rest}
      style={[
        styles.card,
        {
          borderRadius: radius,
          padding,
          backgroundColor: raised ? colors.surfaceRaised : colors.surface,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
});
