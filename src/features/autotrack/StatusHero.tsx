import React from 'react';
import {StyleSheet, View} from 'react-native';
import {DeviceMobile, Lightning, WarningCircle} from 'phosphor-react-native';

import {
  AppText,
  GhostButton,
  GradientIconSquare,
  GradientView,
} from '../../components/ui';
import {
  DetectorStatus,
  UPI_APP_NAMES,
} from '../../lib/autotrack/types';
import {colors, radii, spacing, withAlpha} from '../../theme';
import {AutoTrackState, lastSyncLabel} from './autoTrackFormat';

type StatusHeroProps = {
  state: AutoTrackState;
  status: DetectorStatus | null;
  syncing: boolean;
  lastSyncAt: number | null;
  onSyncNow: () => void;
};

const COPY: Record<
  AutoTrackState | 'needs-shizuku',
  {title: string; body: string; tone: string}
> = {
  checking: {
    title: 'Checking…',
    body: 'Looking at which permissions are on.',
    tone: colors.text,
  },
  active: {
    title: 'Active',
    body: 'Paisa is watching for UPI payments and saves them to Activity.',
    tone: colors.mint,
  },
  'needs-permission': {
    title: 'Needs permission',
    body: 'Turn on both permissions below so Paisa can see your UPI payments.',
    tone: colors.gold,
  },
  'needs-shizuku': {
    title: 'Needs setup',
    body: 'Finish the Shizuku and notification steps below so Paisa can see your UPI payments.',
    tone: colors.gold,
  },
  unavailable: {
    title: 'Not available',
    body: 'Auto-tracking works on Android only. On this device, add payments by hand.',
    tone: colors.text,
  },
};

function HeroIcon({state}: {state: AutoTrackState}) {
  if (state === 'unavailable') {
    return (
      <GradientIconSquare size={48} gradient="savings">
        <DeviceMobile size={24} color={colors.text} weight="fill" />
      </GradientIconSquare>
    );
  }
  if (state === 'needs-permission') {
    return (
      <GradientIconSquare size={48} gradient="rose">
        <WarningCircle size={24} color={colors.text} weight="fill" />
      </GradientIconSquare>
    );
  }
  return (
    <GradientIconSquare size={48} glow={state === 'active'}>
      <Lightning size={24} color={colors.text} weight="fill" />
    </GradientIconSquare>
  );
}

/** Status hero: state, supported UPI apps found on this phone, last sync. */
export function StatusHero({
  state,
  status,
  syncing,
  lastSyncAt,
  onSyncNow,
}: StatusHeroProps) {
  const copy =
    COPY[
      state === 'needs-permission' && status?.trackingMethod === 'shizuku'
        ? 'needs-shizuku'
        : state
    ];
  const installed = new Set(status?.installedApps ?? []);
  const interactive = state !== 'unavailable';

  return (
    <GradientView
      gradient={[colors.glow, colors.surface]}
      angle={160}
      positions={[0, 0.7]}
      style={styles.card}>
      <View style={styles.main}>
        <HeroIcon state={state} />
        <View style={styles.text}>
          <AppText variant="label" color={colors.muted}>
            UPI auto-tracking
          </AppText>
          <AppText
            variant="heading"
            color={copy.tone}
            accessibilityRole="header">
            {copy.title}
          </AppText>
        </View>
      </View>
      <AppText variant="label" color={colors.inkSecondary} style={styles.body}>
        {copy.body}
      </AppText>

      {interactive ? (
        <>
          <View
            style={styles.chips}
            accessible
            accessibilityLabel={`Supported apps: ${Object.entries(UPI_APP_NAMES)
              .map(
                ([pkg, name]) =>
                  `${name} ${installed.has(pkg) ? 'installed' : 'not installed'}`,
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

          <View style={styles.divider} />
          <View style={styles.syncRow}>
            <AppText
              variant="label"
              color={colors.muted}
              style={styles.syncText}
              numberOfLines={1}>
              {syncing ? 'Syncing…' : lastSyncLabel(lastSyncAt)}
            </AppText>
            <GhostButton
              label="Sync now"
              tone="ink"
              disabled={syncing}
              onPress={onSyncNow}
              style={styles.syncButton}
            />
          </View>
        </>
      ) : null}
    </GradientView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.cardHero,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    padding: 18,
  },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  text: {
    flex: 1,
    gap: 2,
  },
  body: {
    marginTop: spacing.md,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
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
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    marginTop: spacing.xs,
  },
  syncText: {
    flex: 1,
  },
  syncButton: {
    marginRight: -spacing.lg,
  },
});
