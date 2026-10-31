import React from 'react';
import {View} from 'react-native';
import {Check} from 'phosphor-react-native/src/icons/Check';
import {CheckCircle} from 'phosphor-react-native/src/icons/CheckCircle';
import {Minus} from 'phosphor-react-native/src/icons/Minus';

import {AppText, Card, GradientIconSquare, PrimaryButton} from '../../components/ui';
import {AutoTrackPrefs, DetectorStatus} from '../../lib/autotrack/types';
import {colors, makeStyles, spacing} from '../../theme';

type SetupCompleteProps = {
  status: DetectorStatus | null;
  prefs: AutoTrackPrefs;
  /** Shows "Back to Paisa"; left out where the surrounding flow has its own way on. */
  onDone?: () => void;
};

/** What is on now, in a couple of words each; payment tracking is always on here. */
export function activeCapabilities(
  status: DetectorStatus | null,
  prefs: AutoTrackPrefs,
): {label: string; on: boolean}[] {
  return [
    {label: 'Payment tracking', on: true},
    {label: 'Payment alerts', on: status?.notificationAccessEnabled === true},
    {label: 'Overspend warnings', on: prefs.blockingEnabled},
    {label: 'Payment notes', on: prefs.notesEnabled},
  ];
}

/** The success state once the required step is done: what is on, and a way back. */
export function SetupComplete({status, prefs, onDone}: SetupCompleteProps) {
  const styles = useStyles();
  return (
    <Card padding={spacing.lg}>
      <View style={styles.header}>
        <GradientIconSquare size={40} glow>
          <CheckCircle size={20} color={colors.onAccent} weight="fill" />
        </GradientIconSquare>
        <View style={styles.headerText}>
          <AppText variant="heading" accessibilityRole="header">
            You're all set!
          </AppText>
          <AppText variant="label" color={colors.muted}>
            Payments will show up in Activity.
          </AppText>
        </View>
      </View>

      <View style={styles.list}>
        {activeCapabilities(status, prefs).map(item => (
          <View
            key={item.label}
            style={styles.item}
            accessible
            accessibilityLabel={`${item.label}, ${item.on ? 'on' : 'off'}`}>
            {item.on ? (
              <Check size={14} color={colors.mint} weight="bold" />
            ) : (
              <Minus size={14} color={colors.muted} weight="bold" />
            )}
            <AppText variant="label" color={item.on ? colors.text : colors.muted}>
              {item.label}
            </AppText>
          </View>
        ))}
      </View>

      {onDone ? (
        <PrimaryButton label="Back to Paisa" onPress={onDone} style={styles.done} />
      ) : null}
    </Card>
  );
}

const useStyles = makeStyles(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: spacing.lg,
    rowGap: spacing.sm,
    marginTop: spacing.lg,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: '42%',
  },
  done: {
    marginTop: spacing.lg,
  },
}));
