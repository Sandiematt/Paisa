import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText, PressableScale} from '../../components/ui';
import {colors, layout, radii, spacing} from '../../theme';

/**
 * kind controls the right-side affordance:
 *  'nav'    → chevron ›   (opens a sub-screen)
 *  'edit'   → value + subtle pencil mark (inline edit interaction)
 *  'toggle' → caller passes an accessory (Switch)
 *  'info'   → value only, no chevron, no press (display-only)
 */
export type SettingsRowKind = 'nav' | 'edit' | 'toggle' | 'info';

type SettingsRowProps = {
  label: string;
  /** Secondary line below the label — shows current setting at a glance. */
  subtitle?: string;
  /** Current value shown on the right. */
  value?: string;
  /** Shown in place of value when value is absent — communicates "not set". */
  placeholder?: string;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
  /**
   * Row interaction kind. Determines right-side affordance.
   * Defaults to 'nav' when onPress is provided, 'info' otherwise.
   */
  kind?: SettingsRowKind;
  /** Custom right-side slot — used for Switch toggles. */
  accessory?: React.ReactNode;
};

export function SettingsRow({
  label,
  subtitle,
  value,
  placeholder,
  onPress,
  last = false,
  destructive = false,
  kind,
  accessory,
}: SettingsRowProps) {
  // Resolve effective kind
  const effectiveKind: SettingsRowKind =
    kind ?? (onPress ? 'nav' : 'info');

  const labelColor = destructive ? colors.danger : colors.ink;

  // Value display: actual value, or placeholder in muted colour
  const displayValue = value ?? placeholder;
  const isPlaceholder = !value && !!placeholder;

  const content = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      {/* Left: label + optional subtitle */}
      <View style={styles.labelBlock}>
        <AppText
          variant="body"
          color={labelColor}
          numberOfLines={1}>
          {label}
        </AppText>
        {subtitle ? (
          <AppText
            variant="caption"
            color={colors.inkMuted}
            numberOfLines={1}
            style={styles.subtitle}>
            {subtitle}
          </AppText>
        ) : null}
      </View>

      {/* Right: accessory slot OR value + chevron */}
      {accessory ?? (
        <View style={styles.trailing}>
          {displayValue ? (
            <AppText
              variant="body"
              color={
                destructive
                  ? colors.danger
                  : isPlaceholder
                    ? colors.inkMuted
                    : colors.inkSecondary
              }
              numberOfLines={1}
              style={styles.value}>
              {displayValue}
            </AppText>
          ) : null}
          {effectiveKind === 'nav' || effectiveKind === 'edit' ? (
            <View style={styles.chevronWrap}>
              <AppText
                variant="body"
                color={colors.inkMuted}
                style={styles.chevron}>
                {'›'}
              </AppText>
            </View>
          ) : null}
        </View>
      )}
    </View>
  );

  if (!onPress || effectiveKind === 'info') {
    return content;
  }

  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.99}
      accessibilityRole="button"
      accessibilityLabel={
        value
          ? `${label}, ${value}`
          : placeholder
            ? `${label}, ${placeholder}`
            : label
      }>
      {content}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderBottomWidth: layout.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  labelBlock: {
    flex: 1,
    marginRight: spacing.md,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 2,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    maxWidth: '55%',
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
  chevronWrap: {
    width: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chevron: {
    fontSize: 20,
    lineHeight: 22,
    marginLeft: spacing.xs,
    // Bump visual weight of the chevron to be properly readable
    includeFontPadding: false,
  },
  // Unused but kept for reference — edit rows could show a small pencil dot
  editDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    marginLeft: spacing.xs,
  },
});
