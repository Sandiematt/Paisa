import React from 'react';
import {StyleSheet, View} from 'react-native';

import {AppText} from '../../components/ui';
import {colors, radii, spacing} from '../../theme';

type SettingsSectionProps = {
  title: string;
  children: React.ReactNode;
  footer?: string;
  danger?: boolean;
};

export function SettingsSection({
  title,
  children,
  footer,
  danger = false,
}: SettingsSectionProps) {
  return (
    <View style={styles.wrap}>
      <AppText variant="caption" color={colors.inkMuted} style={styles.title}>
        {title}
      </AppText>
      <View style={[styles.card, danger && styles.cardDanger]}>
        {children}
      </View>
      {footer ? (
        <AppText variant="caption" color={colors.inkMuted} style={styles.footer}>
          {footer}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.xl,
  },
  title: {
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    // Slightly stronger weight so section labels read at a glance
    fontWeight: '600',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    // No outer border on normal sections — surface colour against canvas provides
    // enough separation without adding visual noise.
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  cardDanger: {
    // Keep a very subtle danger-tinted border only for the danger zone.
    borderWidth: 1,
    borderColor: '#E8C4BC',
  },
  footer: {
    marginTop: spacing.sm,
    marginHorizontal: spacing.xs,
    lineHeight: 18,
  },
});
