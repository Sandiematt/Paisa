import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import {
  colors,
  duration,
  easing,
  layout,
  radii,
  spacing,
  typography,
} from '../../theme';
import {AppText} from './AppText';

type TextFieldProps = Omit<TextInputProps, 'style'> & {
  label: string;
  /** Sits below the field, always rendered so focus never shifts the layout. */
  helper?: string;
  error?: string;
  /** Static glyph inside the field, e.g. a currency symbol. */
  prefix?: string;
  /** Control docked to the right inside the field, e.g. a reveal toggle. */
  trailing?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/** Height of the slot the label floats up into, plus its gap to the field. */
const LABEL_SLOT = typography.label.lineHeight! + spacing.xs + 2;
/** Where the label sits at rest: vertically centred inside the field. */
const LABEL_REST_Y =
  LABEL_SLOT + (layout.controlHeight - typography.body.lineHeight!) / 2;

/**
 * The label doubles as the placeholder: at rest it sits inside the field, and
 * on focus (or once the field holds a value) it lifts into the slot above.
 * The slot is always reserved, so the lift never shifts surrounding layout.
 */
export function TextField({
  label,
  helper,
  error,
  prefix,
  trailing,
  style,
  placeholder,
  value,
  defaultValue,
  onChangeText,
  onFocus,
  onBlur,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  // Mirrors the text for uncontrolled usage; `value` wins when it is provided.
  const [text, setText] = useState(defaultValue ?? '');
  const hasValue = (value ?? text).length > 0;
  const floated = focused || hasValue;

  const focus = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(hasValue ? 1 : 0)).current;

  // Colour and font size cannot ride the native driver. This is one small
  // view, so the JS-driven interpolation is cheap.
  const animateFocus = useCallback(
    (toValue: number) => {
      Animated.timing(focus, {
        toValue,
        duration: duration.control,
        easing: easing.standard,
        useNativeDriver: false,
      }).start();
    },
    [focus],
  );

  useEffect(() => {
    Animated.timing(float, {
      toValue: floated ? 1 : 0,
      duration: duration.control,
      easing: easing.out,
      useNativeDriver: false,
    }).start();
  }, [float, floated]);

  const handleFocus = useCallback<NonNullable<TextInputProps['onFocus']>>(
    event => {
      setFocused(true);
      animateFocus(1);
      onFocus?.(event);
    },
    [animateFocus, onFocus],
  );

  const handleBlur = useCallback<NonNullable<TextInputProps['onBlur']>>(
    event => {
      setFocused(false);
      animateFocus(0);
      onBlur?.(event);
    },
    [animateFocus, onBlur],
  );

  const handleChangeText = useCallback(
    (next: string) => {
      setText(next);
      onChangeText?.(next);
    },
    [onChangeText],
  );

  const borderColor = useMemo(() => {
    if (error) {
      return colors.danger;
    }
    return focus.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.hairline, colors.accent],
    });
  }, [error, focus]);

  const labelColor = useMemo(() => {
    if (error) {
      return colors.danger;
    }
    return focus.interpolate({
      inputRange: [0, 1],
      outputRange: [colors.inkMuted, colors.accent],
    });
  }, [error, focus]);

  const labelStyle = useMemo(
    () => ({
      color: labelColor,
      fontSize: float.interpolate({
        inputRange: [0, 1],
        outputRange: [typography.body.fontSize!, typography.label.fontSize!],
      }),
      transform: [
        {
          translateY: float.interpolate({
            inputRange: [0, 1],
            outputRange: [LABEL_REST_Y, 0],
          }),
        },
        {
          // Rest sits with the input text; floated aligns with the helper row.
          translateX: float.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -spacing.lg],
          }),
        },
      ],
    }),
    [float, labelColor],
  );

  const footer = error ?? helper;

  return (
    <View style={style}>
      <Animated.View style={[styles.field, {borderColor}]}>
        {prefix && floated ? (
          <AppText
            variant="bodyStrong"
            color={focused ? colors.ink : colors.inkMuted}
            style={styles.prefix}>
            {prefix}
          </AppText>
        ) : null}
        <TextInput
          {...rest}
          value={value}
          defaultValue={defaultValue}
          onChangeText={handleChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          // The label owns the resting state, so any placeholder hint only
          // appears once the label has moved out of the way.
          placeholder={focused ? placeholder : undefined}
          style={styles.input}
          placeholderTextColor={colors.inkMuted}
          selectionColor={colors.accent}
        />
        {trailing}
      </Animated.View>

      <Animated.Text numberOfLines={1} style={[styles.label, labelStyle]}>
        {label}
      </Animated.Text>

      {footer ? (
        <AppText
          variant="caption"
          color={error ? colors.danger : colors.inkMuted}
          style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    marginTop: LABEL_SLOT,
    height: layout.controlHeight,
    borderRadius: radii.input,
    borderWidth: 1.5,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  label: {
    position: 'absolute',
    // Taps pass through to the input below, so the resting label is tappable.
    pointerEvents: 'none',
    top: 0,
    left: spacing.lg,
    right: spacing.lg,
    fontFamily: typography.label.fontFamily,
    fontWeight: typography.label.fontWeight,
    letterSpacing: typography.label.letterSpacing,
    lineHeight: typography.body.lineHeight,
  },
  prefix: {
    marginRight: spacing.sm,
  },
  input: {
    flex: 1,
    height: '100%',
    padding: 0,
    ...typography.bodyStrong,
    color: colors.ink,
  },
  footer: {
    marginTop: spacing.sm,
  },
});
