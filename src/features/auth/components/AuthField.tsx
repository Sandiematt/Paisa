import React, {useState} from 'react';
import {
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import {AppText} from '../../../components/ui';
import {colors, layout, radii, spacing, typography} from '../../../theme';

type AuthFieldProps = Omit<TextInputProps, 'style'> & {
  /** Muted label above the field. Omit inside compact dialogs. */
  label?: string;
  /** Leading glyph, usually a phosphor icon (~20px). */
  icon?: React.ReactNode;
  /** Control docked to the right inside the field, e.g. a reveal toggle. */
  trailing?: React.ReactNode;
  /** Paints the roseLight border. The message itself is rendered by the screen. */
  invalid?: boolean;
  /** Sit on `ground` instead of `surface`, for fields inside a raised card. */
  inset?: boolean;
  /** Larger centered one-time-code styling. */
  code?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Auth text field in the DX language: optional 13 muted label above, surface
 * fill, 1px line border, lavender on focus, roseLight when invalid.
 */
export function AuthField({
  label,
  icon,
  trailing,
  invalid = false,
  inset = false,
  code = false,
  style,
  onFocus,
  onBlur,
  ...rest
}: AuthFieldProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = invalid
    ? colors.roseLight
    : focused
      ? colors.lavender
      : colors.line;

  return (
    <View style={style}>
      {label ? (
        <AppText variant="label" color={colors.muted} style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View
        style={[
          styles.field,
          inset ? styles.fieldInset : null,
          {borderColor},
        ]}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <TextInput
          {...rest}
          style={[styles.input, code ? styles.code : null]}
          placeholderTextColor={colors.muted}
          selectionColor={colors.lavender}
          underlineColorAndroid="transparent"
          onFocus={event => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={event => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
        {trailing}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: spacing.sm,
    marginLeft: 2,
  },
  field: {
    height: layout.controlHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radii.input,
    borderWidth: 1,
  },
  fieldInset: {
    backgroundColor: colors.ground,
  },
  icon: {
    width: 22,
    height: 22,
    marginRight: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: '100%',
    padding: 0,
    ...typography.bodyStrong,
    color: colors.text,
  },
  code: {
    ...typography.numeric,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    color: colors.text,
  },
});
