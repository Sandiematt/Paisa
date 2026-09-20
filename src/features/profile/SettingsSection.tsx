import React from 'react';
import {StyleSheet, View} from 'react-native';

import {GlassPanel, Text} from '../../components/ui';
import {colors, fonts, radii, shadows} from '../../theme';

type SettingsSectionProps = {
  title: string;
  children: React.ReactNode;
  footer?: string;
  danger?: boolean;
  /** Inner padding. Row lists use horizontal-only so rows can draw full-bleed dividers. */
  padded?: boolean;
};

const LABEL = '#9A8C72';
const DANGER = '#B8484A';

export function SettingsSection({
  title,
  children,
  footer,
  danger = false,
  padded = false,
}: SettingsSectionProps) {
  if (danger) {
    return (
      <View style={styles.wrap}>
        <Text
          fontFamily={fonts.interSemi}
          fontSize={11}
          lineHeight={14}
          fontWeight="600"
          letterSpacing={1.32}
          color={DANGER}
          textTransform="uppercase"
          style={styles.title}>
          {title}
        </Text>
        <View style={styles.dangerCard}>{children}</View>
        {footer ? (
          <Text
            fontFamily={fonts.interMedium}
            fontSize={11}
            lineHeight={15}
            fontWeight="500"
            color="#6F634E"
            style={styles.footer}>
            {footer}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text
        fontFamily={fonts.interSemi}
        fontSize={11}
        lineHeight={14}
        fontWeight="600"
        letterSpacing={1.32}
        color={LABEL}
        textTransform="uppercase"
        style={styles.title}>
        {title}
      </Text>
      <GlassPanel
        style={shadows.card}
        radius={radii.cardHero - 4}
        intensity="xl"
        overlayColor={colors.glass}
        contentStyle={padded ? styles.paddedInner : styles.rowInner}>
        {children}
      </GlassPanel>
      {footer ? (
        <Text
          fontFamily={fonts.interMedium}
          fontSize={11}
          lineHeight={15}
          fontWeight="500"
          color="#6F634E"
          style={styles.footer}>
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  title: {
    paddingHorizontal: 4,
  },
  paddedInner: {
    padding: 20,
    gap: 16,
  },
  rowInner: {
    paddingHorizontal: 20,
    paddingVertical: 0,
  },
  dangerCard: {
    backgroundColor: '#B8484A0F',
    borderWidth: 1,
    borderColor: '#B8484A33',
    borderRadius: 24,
    paddingHorizontal: 20,
  },
  footer: {
    paddingHorizontal: 4,
  },
});
