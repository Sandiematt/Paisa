import React from 'react';
import { View } from 'react-native';
import { DeviceMobile } from 'phosphor-react-native/src/icons/DeviceMobile';
import { Lightning } from 'phosphor-react-native/src/icons/Lightning';
import { PauseCircle } from 'phosphor-react-native/src/icons/PauseCircle';
import { WarningCircle } from 'phosphor-react-native/src/icons/WarningCircle';

import {
  AppText,
  GhostButton,
  GradientIconSquare,
  GradientView,
} from '../../components/ui';
import { DetectorStatus, UPI_APP_NAMES } from '../../lib/autotrack/types';
import { colors, makeStyles, radii, spacing, withAlpha } from '../../theme';
import type { ColorToken } from '../../theme';
import { AutoTrackState, lastDetectedLabel } from './autoTrackFormat';

type StatusHeroProps = {
  state: AutoTrackState;
  status: DetectorStatus | null;
  /** When the newest payment was detected; null when none yet. Left out (no footer) during onboarding. */
  lastDetectedAt?: number | null;
  syncing?: boolean;
  onSyncNow?: () => void;
};

const BADGE: Record<AutoTrackState, { label: string; tone: ColorToken }> = {
  checking: { label: 'Checking…', tone: 'muted' },
  active: { label: 'Active', tone: 'mint' },
  paused: { label: 'Paused', tone: 'lavender' },
  'setup-required': { label: 'Setup required', tone: 'gold' },
  unavailable: { label: 'Not available', tone: 'muted' },
};

function HeroIcon({ state }: { state: AutoTrackState }) {
  if (state === 'unavailable') {
    return (
      <GradientIconSquare size={40} gradient="savings">
        <DeviceMobile size={20} color={colors.onAccent} weight="fill" />
      </GradientIconSquare>
    );
  }
  if (state === 'setup-required') {
    return (
      <GradientIconSquare size={40} gradient="rose">
        <WarningCircle size={20} color={colors.onAccent} weight="fill" />
      </GradientIconSquare>
    );
  }
  if (state === 'paused') {
    return (
      <GradientIconSquare size={40} gradient="savings">
        <PauseCircle size={20} color={colors.onAccent} weight="fill" />
      </GradientIconSquare>
    );
  }
  return (
    <GradientIconSquare size={40} glow={state === 'active'}>
      <Lightning size={20} color={colors.onAccent} weight="fill" />
    </GradientIconSquare>
  );
}

/** What auto-tracking does, where it stands, the supported apps and the last detection. */
export function StatusHero({
  state,
  status,
  lastDetectedAt,
  syncing = false,
  onSyncNow,
}: StatusHeroProps) {
  const styles = useStyles();
  const badge = BADGE[state];
  const installed = new Set(status?.installedApps ?? []);
  const unavailable = state === 'unavailable';
  const badgeColor = colors[badge.tone];

  return (
    <GradientView
      gradient={[colors.glow, colors.surface]}
      angle={160}
      positions={[0, 0.7]}
      style={styles.card}>
      <View style={styles.top}>
        <HeroIcon state={state} />
        <View
          style={[
            styles.badge,
            {
              borderColor: withAlpha(badgeColor, 0.4),
              backgroundColor: withAlpha(badgeColor, 0.12),
            },
          ]}
          accessible
          accessibilityLabel={`Auto-tracking status: ${badge.label}`}>
          <View style={[styles.badgeDot, { backgroundColor: badgeColor }]} />
          <AppText variant="label" color={badgeColor}>
            {badge.label}
          </AppText>
        </View>
      </View>

      <AppText
        variant="title"
        accessibilityRole="header"
        style={styles.heading}>
        Never miss a UPI expense again.
      </AppText>
      <AppText variant="label" color={colors.inkSecondary} style={styles.body}>
        {unavailable
          ? 'Auto-tracking works on Android only. On this device, add payments by hand.'
          : 'Paisa adds your UPI payments for you.'}
      </AppText>

      {unavailable ? null : (
        <>
          <View
            style={styles.chips}
            accessible
            accessibilityLabel={`Supported apps: ${Object.entries(UPI_APP_NAMES)
              .map(
                ([pkg, name]) =>
                  `${name} ${
                    installed.has(pkg) ? 'installed' : 'not installed'
                  }`,
              )
              .join(', ')}`}>
            {Object.entries(UPI_APP_NAMES).map(([pkg, name]) => {
              const on = installed.has(pkg);
              return (
                <View key={pkg} style={[styles.chip, on && styles.chipOn]}>
                  <View style={[styles.dot, on && styles.dotOn]} />
                  <AppText
                    variant="label"
                    color={on ? colors.text : colors.muted}>
                    {name}
                  </AppText>
                </View>
              );
            })}
          </View>

          {lastDetectedAt === undefined ? null : (
            <>
              <View style={styles.divider} />
              <View style={styles.footer}>
                <AppText
                  variant="label"
                  color={colors.muted}
                  style={styles.footerText}
                  numberOfLines={1}>
                  {syncing
                    ? 'Saving payments to Activity…'
                    : lastDetectedLabel(lastDetectedAt)}
                </AppText>
                <GhostButton
                  label="Sync now"
                  tone="ink"
                  disabled={syncing}
                  onPress={() => onSyncNow?.()}
                  style={styles.syncButton}
                />
              </View>
            </>
          )}
        </>
      )}
    </GradientView>
  );
}

const useStyles = makeStyles(() => ({
  card: {
    borderRadius: radii.cardHero,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    padding: 18,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  badgeDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  heading: {
    marginTop: spacing.md,
  },
  body: {
    marginTop: spacing.xs,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: withAlpha(colors.text, 0.04),
  },
  chipOn: {
    borderColor: withAlpha(colors.mint, 0.4),
    backgroundColor: withAlpha(colors.mint, 0.12),
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: withAlpha(colors.text, 0.25),
  },
  dotOn: {
    backgroundColor: colors.mint,
  },
  divider: {
    height: 1,
    backgroundColor: colors.line,
    marginTop: spacing.lg,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  footerText: {
    flex: 1,
  },
  syncButton: {
    marginRight: -spacing.lg,
  },
}));
