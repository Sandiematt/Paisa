import React from 'react';
import {View} from 'react-native';
import {CaretDown} from 'phosphor-react-native/src/icons/CaretDown';
import {CaretUp} from 'phosphor-react-native/src/icons/CaretUp';

import {
  AppText,
  Card,
  PressableScale,
  SecondaryButton,
} from '../../components/ui';
import {colors, makeStyles, spacing} from '../../theme';
import {MAX_LOG_LINES} from './autoTrackFormat';

type DiagnosticsSectionProps = {
  open: boolean;
  onToggle: () => void;
  /** Newest first, as the detector returns it. */
  log: string[];
  onShareReport: () => void;
  onClearHistory: () => void;
};

/** Collapsible live log with Share report and Clear history. */
export function DiagnosticsSection({
  open,
  onToggle,
  log,
  onShareReport,
  onClearHistory,
}: DiagnosticsSectionProps) {
  const styles = useStyles();
  const lines = log.slice(0, MAX_LOG_LINES);
  const Caret = open ? CaretUp : CaretDown;

  return (
    <View>
      <PressableScale
        onPress={onToggle}
        scaleTo={0.99}
        accessibilityRole="button"
        accessibilityLabel="Diagnostics"
        accessibilityState={{expanded: open}}
        accessibilityHint={open ? 'Hides the log' : 'Shows the log'}
        style={styles.header}>
        <AppText variant="sectionTitle" style={styles.title}>
          Diagnostics
        </AppText>
        <Caret size={18} color={colors.muted} weight="bold" />
      </PressableScale>

      {open ? (
        <View style={styles.body}>
          <Card padding={14}>
            {lines.length === 0 ? (
              <AppText variant="caption" color={colors.muted}>
                Nothing logged yet.
              </AppText>
            ) : (
              lines.map((line, index) => (
                <AppText
                  key={`${index}:${line}`}
                  variant="caption"
                  color={colors.muted}
                  selectable
                  style={styles.line}>
                  {line}
                </AppText>
              ))
            )}
          </Card>
          <View style={styles.actions}>
            <SecondaryButton
              label="Share report"
              onPress={onShareReport}
              accessibilityHint="Opens the share sheet with a diagnostic report"
              style={styles.action}
            />
            <PressableScale
              onPress={onClearHistory}
              scaleTo={0.97}
              accessibilityRole="button"
              accessibilityLabel="Clear history"
              accessibilityHint="Deletes detected payments and the log from this phone"
              style={styles.clear}>
              <AppText variant="bodyStrong" color={colors.roseLight}>
                Clear history
              </AppText>
            </PressableScale>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
    minHeight: 44,
  },
  title: {
    flexShrink: 1,
  },
  body: {
    marginTop: spacing.md,
    gap: spacing.md,
  },
  line: {
    paddingVertical: 3,
  },
  actions: {
    gap: spacing.sm,
  },
  action: {
    alignSelf: 'stretch',
  },
  clear: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
}));
