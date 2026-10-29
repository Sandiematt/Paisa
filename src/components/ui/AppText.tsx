import React from 'react';
import {StyleProp, Text, TextProps, TextStyle} from 'react-native';

import {colors, typography, TypographyVariant, useTheme} from '../../theme';

type AppTextProps = TextProps & {
  variant?: TypographyVariant;
  color?: string;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
};

export function AppText({
  variant = 'body',
  color = colors.ink,
  align,
  style,
  ...rest
}: AppTextProps) {
  // Subscribes to the scheme so the default colour follows a theme switch.
  useTheme();
  return (
    <Text
      {...rest}
      style={[typography[variant], {color, textAlign: align}, style]}
    />
  );
}
