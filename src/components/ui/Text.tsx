import React from 'react';
import {Text as RNText, TextProps as RNTextProps, TextStyle} from 'react-native';

type StyleAsProps = Pick<
  TextStyle,
  | 'fontFamily'
  | 'fontSize'
  | 'lineHeight'
  | 'fontWeight'
  | 'color'
  | 'letterSpacing'
  | 'textAlign'
  | 'textTransform'
>;

export type TextProps = RNTextProps & StyleAsProps;

export function Text({
  fontFamily,
  fontSize,
  lineHeight,
  fontWeight,
  color,
  letterSpacing,
  textAlign,
  textTransform,
  style,
  ...rest
}: TextProps) {
  return (
    <RNText
      style={[
        fontFamily != null ? {fontFamily} : null,
        fontSize != null ? {fontSize} : null,
        lineHeight != null ? {lineHeight} : null,
        fontWeight != null ? {fontWeight} : null,
        color != null ? {color} : null,
        letterSpacing != null ? {letterSpacing} : null,
        textAlign != null ? {textAlign} : null,
        textTransform != null ? {textTransform} : null,
        style,
      ]}
      {...rest}
    />
  );
}
