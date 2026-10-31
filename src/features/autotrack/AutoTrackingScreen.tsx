import React, {useEffect, useState} from 'react';
import {Alert, Modal, ScrollView, View} from 'react-native';
import {useSafeAreaInsets} from 'react-native-safe-area-context';

import {
  AppText,
  BackButton,
  Screen,
  SectionTitle,
  Stagger,
} from '../../components/ui';
import {isDeveloperModeEnabled} from '../../lib/autotrack/nativeUpiDetector';
import {makeStyles, spacing} from '../../theme';
import {ActivitySkeleton} from '../activity/ActivitySkeleton';
import {useLoadingGate} from '../insights/loadingGate';
import {AllowanceCard} from './AllowanceCard';
import {useAutoTrack} from './AutoTrackProvider';
import {AutoTrackSetup} from './AutoTrackSetup';
import {groupPayments, lastDetectedAt} from './autoTrackFormat';
import {DetectedPayments} from './DetectedPayments';
import {DiagnosticsSection} from './DiagnosticsSection';

type AutoTrackingScreenProps = {
  visible: boolean;
  onClose: () => void;
  currencySymbol: string;
  /** Opens the budget editor, for when no monthly budget is set. */
  onOpenBudget: () => void;
};

/**
 * Dashboard for UPI auto-tracking: the same setup as onboarding
 * ([AutoTrackSetup]), then today's allowance and the detected payments.
 * Auto-tracking stays optional: nothing here blocks the rest of Paisa.
 */
export function AutoTrackingScreen({
  visible,
  onClose,
  currencySymbol,
  onOpenBudget,
}: AutoTrackingScreenProps) {
  const styles = useStyles();
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
    keep,
    merge,
    clearHistory,
    shareReport,
  } = useAutoTrack();
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  // Diagnostics are for debugging only: shown when Developer options are on.
  const [developerMode, setDeveloperMode] = useState(false);
  const showSkeleton = useLoadingGate(loading);

  // Permissions are granted in system settings, so look again on every open.
  useEffect(() => {
    if (visible) {
      refreshStatus();
      isDeveloperModeEnabled().then(setDeveloperMode, () => setDeveloperMode(false));
    }
  }, [refreshStatus, visible]);

  useEffect(() => {
    if (!visible) {
      setDiagnosticsOpen(false);
    }
  }, [visible]);

  // The detector only streams its log while the panel is expanded.
  const showLog = visible && developerMode && diagnosticsOpen;
  useEffect(() => {
    if (!showLog) {
      return;
    }
    setLogStreaming(true);
    return () => setLogStreaming(false);
  }, [setLogStreaming, showLog]);

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
            <AutoTrackSetup
              supported={supported}
              status={status}
              prefs={prefs}
              prefsDisabled={!prefsLoaded}
              onPrefsChange={updatePrefs}
              onChangeMethod={method => {
                setTrackingMethod(method).catch(() => {});
              }}
              lastDetectedAt={lastDetectedAt(transactions)}
              syncing={syncing}
              onSyncNow={() => {
                syncNow().catch(() => {});
              }}
              onDone={onClose}
            />
          </Stagger>

          {supported ? (
            <>
              <Stagger index={1}>
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

              <Stagger index={2}>
                <SectionTitle
                  title="Detected payments"
                  style={styles.sectionTitle}
                />
                {payments}
              </Stagger>

              {developerMode ? (
                <Stagger index={3} style={styles.diagnostics}>
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
              ) : null}
            </>
          ) : null}
        </ScrollView>
      </Screen>
    </Modal>
  );
}

const useStyles = makeStyles(() => ({
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
  diagnostics: {
    marginTop: 26,
  },
}));
