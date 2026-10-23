import React from 'react';
import {Modal, ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  AppText,
  BackButton,
  BACK_BUTTON_SIZE,
  Card,
  GradientView,
  Screen,
} from '../../components/ui';
import {colors, layout, radii, spacing, withAlpha} from '../../theme';

const HERO_GRADIENT = [colors.surfaceRaised, colors.surface, withAlpha(colors.glow, 0.77)];
const HERO_POSITIONS = [0, 0.62, 1];

type DetailsFrameProps = {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
};

/** Full-screen DX details page: glow, back button, centred title, scroll. */
export function DetailsFrame({visible, title, onClose, children}: DetailsFrameProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <Screen glow={300} edges={['top']}>
        <View style={styles.topBar}>
          <BackButton onPress={onClose} />
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            {title}
          </AppText>
          <View style={styles.topBarSpacer} />
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.xxl},
          ]}
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </Screen>
    </Modal>
  );
}

type HeroCardProps = {
  label: string;
  amount: string;
  amountColor?: string;
  children?: React.ReactNode;
};

/** Spotlight-style hero: caption, big tabular amount, meter underneath. */
export function HeroCard({label, amount, amountColor = colors.text, children}: HeroCardProps) {
  return (
    <View style={styles.hero}>
      <GradientView
        gradient={HERO_GRADIENT}
        angle={160}
        positions={HERO_POSITIONS}
        style={styles.heroBody}>
        <AppText variant="label" color={colors.muted}>
          {label}
        </AppText>
        <AppText
          variant="numericHero"
          color={amountColor}
          style={styles.heroAmount}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}>
          {amount}
        </AppText>
        {children}
      </GradientView>
    </View>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  dotColor: string;
  valueColor?: string;
};

export function StatCard({label, value, dotColor, valueColor = colors.text}: StatCardProps) {
  return (
    <Card style={styles.stat} padding={16}>
      <View style={[styles.statDot, {backgroundColor: dotColor}]} />
      <AppText variant="label" color={colors.muted}>
        {label}
      </AppText>
      <AppText
        variant="numeric"
        color={valueColor}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={styles.statValue}>
        {value}
      </AppText>
    </Card>
  );
}

export function StatRow({children}: {children: React.ReactNode}) {
  return <View style={styles.statRow}>{children}</View>;
}

export const detailsStyles = StyleSheet.create({
  gap: {
    marginTop: spacing.lg,
  },
  meter: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  meterFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  listRow: {
    paddingVertical: spacing.md,
  },
  listRowLabel: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minWidth: 0,
  },
  listRowFlex: {
    flex: 1,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  sliceBar: {
    marginTop: spacing.sm,
  },
  pct: {
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  derivedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  tabular: {
    fontVariant: ['tabular-nums'],
  },
  cardTitle: {
    marginBottom: spacing.xs,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: withAlpha(colors.roseLight, 0.4),
    backgroundColor: colors.alertDanger,
  },
  warningText: {
    flex: 1,
  },
  note: {
    marginTop: spacing.md,
  },
  emptyCard: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xxl,
  },
});

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  title: {
    flex: 1,
    textAlign: 'center',
  },
  topBarSpacer: {
    width: BACK_BUTTON_SIZE,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: layout.screenPadding,
    paddingTop: spacing.sm,
  },
  hero: {
    borderRadius: radii.cardHero,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  heroBody: {
    padding: 20,
  },
  heroAmount: {
    marginTop: 4,
  },
  statRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  stat: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  statDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: spacing.sm,
  },
  statValue: {
    fontSize: 22,
    lineHeight: 28,
  },
});
