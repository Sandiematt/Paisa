import React, {useEffect, useState} from 'react';
import {Alert, Modal, ScrollView, StyleSheet, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {NotePencil, ShieldWarning} from 'phosphor-react-native';

import {
  AppText,
  BackButton,
  Screen,
  SectionTitle,
  SettingsGroup,
  SettingsRow,
  Stagger,
  ToggleSwitch,
} from '../../components/ui';
import {DEFAULT_TRACKING_METHOD} from '../../lib/autotrack/types';
import {colors, spacing} from '../../theme';
import {ActivitySkeleton} from '../activity/ActivitySkeleton';
import {useLoadingGate} from '../insights/loadingGate';
import {AllowanceCard} from './AllowanceCard';
import {useAutoTrack} from './AutoTrackProvider';
import {autoTrackState, groupPayments} from './autoTrackFormat';
import {DetectedPayments} from './DetectedPayments';
import {DiagnosticsSection} from './DiagnosticsSection';
import {PermissionsGroup, SHIZUKU_HELP} from './PermissionsGroup';
import {StatusHero} from './StatusHero';
import {TrackingMethodPicker} from './TrackingMethodPicker';

type AutoTrackingScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  /** Opens the budget editor, for when no monthly budget is set. */
  onOpenBudget: () => void;
};

const ICON_SIZE = 24;

/** Dashboard for UPI auto-tracking: status, permissions, allowance, toggles, payments. */
export function AutoTrackingScreen({
  visible,
  onClose,
  currencySymbol,
  onOpenBudget,
}: AutoTrackingScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    supported,
    loading,
    status,
    refreshStatus,
    setTrackingMethod,
    prefs,
    prefsLoaded,
    updatePrefs,
    transactions,
    log,
    setLogStreaming,
    allowance,
    syncNow,
    syncing,
    lastSyncAt,
    keep,
    merge,
    clearHistory,
    shareReport,
  } = useAutoTrack();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const showSkeleton = useLoadingGate(loading);

  // Permissions are granted in system settings, so look again on every open.
  useEffect(() => {
    if (visible) {
      refreshStatus();
    }
  }, [refreshStatus, visible]);

  useEffect(() => {
    if (!visible) {
      setDiagnosticsOpen(false);
    }
  }, [visible]);

  // The detector only streams its log while the panel is expanded.
  const showLog = visible && diagnosticsOpen;
  useEffect(() => {
    if (!showLog) {
      return;
    }
    setLogStreaming(true);
    return () => setLogStreaming(false);
  }, [setLogStreaming, showLog]);

  const state = autoTrackState(supported, status);
  // Cheap (50 rows), and re-run each render so Today/Yesterday stay current.
  const groups = groupPayments(transactions);

  const confirmClear = () => {
    Alert.alert(
      'Clear history?',
      'This deletes the detected payments and the log stored on this phone. Payments already saved to Activity stay there.',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Clear history',
          style: 'destructive',
          onPress: () => {
            clearHistory().catch(() => {});
          },
        },
      ],
    );
  };

  let payments: React.ReactNode;
  if (showSkeleton) {
    payments = <ActivitySkeleton rows={3} label="Loading detected payments" />;
  } else if (loading) {
    payments = null;
  } else {
    payments = (
      <DetectedPayments
        groups={groups}
        currencySymbol={currencySymbol}
        onKeep={keep}
        onMerge={merge}
      />
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}>
      <Screen glow={300} edges={['top']} style={styles.screen}>
        <View style={styles.header}>
          <BackButton onPress={onClose} />
          <AppText variant="title" accessibilityRole="header" style={styles.title}>
            Auto-tracking
          </AppText>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[
            styles.content,
            {paddingBottom: Math.max(insets.bottom, spacing.xxl) + spacing.xl},
          ]}
          showsVerticalScrollIndicator={false}>
          <Stagger index={0}>
            <StatusHero
              state={state}
              status={status}
              syncing={syncing}
              lastSyncAt={lastSyncAt}
              onSyncNow={() => {
                syncNow().catch(() => {});
              }}
            />
          </Stagger>

          {supported ? (
            <>
              <Stagger index={1}>
                <SectionTitle
                  title="How Paisa reads payments"
                  style={styles.sectionTitle}
                />
                <TrackingMethodPicker
                  method={status?.trackingMethod ?? DEFAULT_TRACKING_METHOD}
                  onChange={method => {
                    setTrackingMethod(method).catch(() => {});
                  }}
                />
                <SectionTitle title="Permissions" style={styles.sectionTitle} />
                <PermissionsGroup status={status} />
                {status?.trackingMethod === 'shizuku' ? (
                  <AppText
                    variant="caption"
                    color={colors.muted}
                    style={styles.footnote}>
                    {SHIZUKU_HELP}
                  </AppText>
                ) : null}
              </Stagger>

              <Stagger index={2}>
                <SectionTitle
                  title="Today's allowance"
                  style={styles.sectionTitle}
                />
                <AllowanceCard
                  allowance={allowance}
                  currencySymbol={currencySymbol}
                  onOpenBudget={onOpenBudget}
                />
              </Stagger>

              <Stagger index={3}>
                <SectionTitle title="Settings" style={styles.sectionTitle} />
                <SettingsGroup>
                  <SettingsRow
                    icon={<NotePencil size={ICON_SIZE} color={colors.text} />}
                    label="Transaction notes"
                    trailing={
                      <ToggleSwitch
                        value={prefs.notesEnabled}
                        disabled={!prefsLoaded}
                        onValueChange={next => updatePrefs({notesEnabled: next})}
                        accessibilityLabel="Transaction notes"
                      />
                    }
                  />
                  <SettingsRow
                    icon={<ShieldWarning size={ICON_SIZE} color={colors.text} />}
                    label="Over-budget blocking"
                    trailing={
                      <ToggleSwitch
                        value={prefs.blockingEnabled}
                        disabled={!prefsLoaded}
                        onValueChange={next => updatePrefs({blockingEnabled: next})}
                        accessibilityLabel="Over-budget blocking"
                      />
                    }
                  />
                </SettingsGroup>
                <AppText
                  variant="caption"
                  color={colors.muted}
                  style={styles.footnote}>
                  Ask what each detected payment was for. Notes appear on the
                  payment in Activity.
                </AppText>
                <AppText
                  variant="caption"
                  color={colors.muted}
                  style={styles.footnote}>
                  Warn on the UPI Pay screen when a payment would go over
                  today's limit. It can't stop a payment, but Cancel takes you
                  back.
                </AppText>
              </Stagger>

              <Stagger index={4}>
                <SectionTitle
                  title="Detected payments"
                  style={styles.sectionTitle}
                />
                {payments}
              </Stagger>

              <Stagger index={5} style={styles.diagnostics}>
                <DiagnosticsSection
                  open={diagnosticsOpen}
                  onToggle={() => setDiagnosticsOpen(value => !value)}
                  log={log}
                  onShareReport={() => {
                    shareReport().catch(() => {});
                  }}
                  onClearHistory={confirmClear}
                />
              </Stagger>
            </>
          ) : null}
        </ScrollView>
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 14,
    zIndex: 10,
  },
  title: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  sectionTitle: {
    paddingTop: 26,
    paddingBottom: 12,
  },
  footnote: {
    paddingHorizontal: 4,
    paddingTop: 10,
  },
  diagnostics: {
    marginTop: 26,
  },
});
