import React from 'react';
import {StyleSheet, View} from 'react-native';

import {ChevronRightIcon} from '../../components/icons/FeatherIcons';
import {PressableScale, Text} from '../../components/ui';
import {fonts} from '../../theme';

export type SettingsRowKind = 'nav' | 'edit' | 'toggle' | 'info';

type SettingsRowProps = {
  label: string;
  subtitle?: string;
  value?: string;
  placeholder?: string;
  onPress?: () => void;
  last?: boolean;
  destructive?: boolean;
  kind?: SettingsRowKind;
  accessory?: React.ReactNode;
  icon?: React.ReactNode;
};

const INK = '#22201B';
const MUTED = '#6F634E';
const CHEVRON = '#B0A488';
const DIVIDER = '#00000010';
const CHIP = '#00000008';
const DANGER = '#B8484A';
const DANGER_CHIP = '#B8484A1A';

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
  icon,
}: SettingsRowProps) {
  const effectiveKind: SettingsRowKind = kind ?? (onPress ? 'nav' : 'info');
  const displayValue = value ?? placeholder;
  const isPlaceholder = !value && !!placeholder;
  const labelColor = destructive ? DANGER : INK;
  const showChevron = effectiveKind === 'nav' || effectiveKind === 'edit';

  const content = (
    <View style={[styles.row, !last && styles.rowDivider]}>
      {icon ? (
        <View
          style={[
            styles.chip,
            destructive ? styles.chipDanger : null,
          ]}>
          {icon}
        </View>
      ) : null}

      <View style={styles.labelBlock}>
        <Text
          fontFamily={fonts.interSemi}
          fontSize={15}
          lineHeight={20}
          fontWeight={destructive ? '700' : '600'}
          color={labelColor}
          numberOfLines={1}>
          {label}
        </Text>
        {subtitle ? (
          <Text
            fontFamily={fonts.interMedium}
            fontSize={12}
            lineHeight={16}
            fontWeight="500"
            color={MUTED}
            numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {accessory ?? (
        <View style={styles.trailing}>
          {displayValue ? (
            <Text
              fontFamily={fonts.interSemi}
              fontSize={14}
              lineHeight={18}
              fontWeight="600"
              color={
                destructive
                  ? DANGER
                  : isPlaceholder || effectiveKind === 'info'
                    ? MUTED
                    : INK
              }
              numberOfLines={1}
              style={styles.value}>
              {displayValue}
            </Text>
          ) : null}
          {showChevron ? (
            <ChevronRightIcon
              color={destructive ? DANGER : CHEVRON}
              size={16}
            />
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
    paddingVertical: 16,
    gap: 14,
  },
  rowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER,
  },
  chip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: CHIP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipDanger: {
    backgroundColor: DANGER_CHIP,
    marginRight: 0,
  },
  labelBlock: {
    flex: 1,
    gap: 2,
    justifyContent: 'center',
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 1,
    maxWidth: '55%',
  },
  value: {
    flexShrink: 1,
    textAlign: 'right',
  },
});
