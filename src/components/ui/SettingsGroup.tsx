import React from 'react';
import {StyleProp, StyleSheet, View, ViewStyle} from 'react-native';
import {CaretRight} from 'phosphor-react-native';

import {colors, radii, spacing} from '../../theme';
import {AppText} from './AppText';
import {PressableScale} from './PressableScale';

type SettingsGroupProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

/**
 * Grouped list card: `surface`, radius 22, 1px `line` border, 18px side
 * padding. Put `SettingsRow`s inside; the last row drops its divider
 * automatically.
 */
export function SettingsGroup({children, style}: SettingsGroupProps) {
  const rows = React.Children.toArray(children).filter(React.isValidElement);
  return (
    <View style={[styles.group, style]}>
      {rows.map((row, index) =>
        React.cloneElement(row as React.ReactElement<{last?: boolean}>, {
          last: index === rows.length - 1,
        }),
      )}
    </View>
  );
}

type SettingsRowProps = {
  /** 24px icon, usually phosphor in `colors.text`. */
  icon?: React.ReactNode;
  label: string;
  /** Muted value on the right, e.g. "INR". */
  value?: string;
  /** Replaces the value/caret, e.g. a `ToggleSwitch`. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** `danger` tints label in roseLight (sign out). Icon colour is yours. */
  tone?: 'default' | 'danger';
  /** Force the caret on/off. Default: shown when pressable with no trailing. */
  showCaret?: boolean;
  /** Set by `SettingsGroup`; hides the bottom divider. */
  last?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/**
 * One 17px-padded row: icon, 16/600 label, muted value or trailing control,
 * caret when it navigates. With a `ToggleSwitch` as `trailing`, leave
 * `onPress` unset and let the switch handle the tap.
 */
export function SettingsRow({
  icon,
  label,
  value,
  trailing,
  onPress,
  tone = 'default',
  showCaret,
  last = false,
  accessibilityLabel,
  accessibilityHint,
}: SettingsRowProps) {
  const labelColor = tone === 'danger' ? colors.roseLight : colors.text;
  const caret = showCaret ?? (onPress != null && trailing == null);

  const content = (
    <View style={[styles.row, !last && styles.divider]}>
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <AppText
        variant="rowLabel"
        color={labelColor}
        numberOfLines={1}
        style={styles.label}>
        {label}
      </AppText>
      {value ? (
        <AppText variant="label" color={colors.muted} numberOfLines={1} style={styles.value}>
          {value}
        </AppText>
      ) : null}
      {trailing}
      {caret ? <CaretRight size={18} color={colors.muted} weight="bold" /> : null}
    </View>
  );

  if (!onPress) {
    return content;
  }
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  group: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 18,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 17,
    gap: spacing.lg,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  icon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    flex: 1,
  },
  value: {
    fontSize: 14,
    maxWidth: '45%',
  },
});
