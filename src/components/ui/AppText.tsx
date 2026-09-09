import React from 'react';
import {StyleProp, Text, TextProps, TextStyle} from 'react-native';

import {colors, typography, TypographyVariant} from '../../theme';

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
  return (
    <Text
      {...rest}
      style={[typography[variant], {color, textAlign: align}, style]}
    />
  );
}
