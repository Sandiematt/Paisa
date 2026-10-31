import React from 'react';
import {StyleSheet, View} from 'react-native';

import {SelectCard} from '../../components/ui';
import {TrackingMethod} from '../../lib/autotrack/types';
import {colors, spacing} from '../../theme';

type TrackingMethodPickerProps = {
  method: TrackingMethod;
  onChange: (method: TrackingMethod) => void;
};

const OPTIONS: {
  method: TrackingMethod;
  title: string;
  description: string;
  accent: string;
}[] = [
  {
    method: 'accessibility',
    title: 'Accessibility service',
    description:
      'Turn on Paisa in Android settings. Works on every phone, nothing else to install.',
    accent: colors.lavender,
  },
  {
    method: 'shizuku',
    title: 'Shizuku',
    description:
      'No accessibility permission. Needs the Shizuku app, started once over wireless debugging.',
    accent: colors.mint,
  },
];

/**
 * How Paisa reads the UPI apps' payment screens. One radio group: the
 * accessibility service or Shizuku. Device-wide, so it is saved natively.
 */
export function TrackingMethodPicker({
  method,
  onChange,
}: TrackingMethodPickerProps) {
  return (
    <View accessibilityRole="radiogroup" style={styles.group}>
      {OPTIONS.map(option => (
        <SelectCard
          key={option.method}
          title={option.title}
          description={option.description}
          accent={option.accent}
          selected={method === option.method}
          onSelect={() => {
            if (method !== option.method) {
              onChange(option.method);
            }
          }}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.md,
  },
});
