import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {AppState, Share} from 'react-native';

import {
  loadAutoTrackPrefs,
  saveAutoTrackPrefs,
} from '../../lib/autotrack/autoTrackPrefs';
import * as native from '../../lib/autotrack/nativeUpiDetector';
import {
  AutoTrackPrefs,
  BudgetSnapshot,
  DEFAULT_AUTO_TRACK_PREFS,
  DailyAllowance,
  DetectedTxn,
  DetectorChangeReason,
  DetectorStatus,
} from '../../lib/autotrack/types';
import {
  TransactionRow,
  localDateISO,
  upsertDetectedTransaction,
} from '../../lib/transactionsStore';
import {useAuth} from '../auth/AuthProvider';
import {
  buildBudgetSnapshot,
  dailyAllowance,
  unsyncedSpendByDate,
} from './dailyAllowance';
import {createSyncDrain} from './syncDrain';

export type AutoTrackValue = {
  /** False off Android or when the native module is missing; everything below is then inert. */
  supported: boolean;
  /** True until the first read of the detector finishes. */
  loading: boolean;
  status: DetectorStatus | null;
  refreshStatus: () => Promise<void>;
  prefs: AutoTrackPrefs;
  /** False until this user's stored prefs are loaded; updatePrefs does nothing before then. */
  prefsLoaded: boolean;
  updatePrefs: (patch: Partial<AutoTrackPrefs>) => void;
  /**
   * Toggles chosen during onboarding, before the account may exist. Applied
   * at once when this user's prefs are already loaded, otherwise in place of
   * the stored ones when the next user's prefs load.
   */
  stagePrefs: (next: AutoTrackPrefs) => void;
  /** Payments the detector has recorded, in the order native returns them. */
  transactions: DetectedTxn[];
  /** Only filled while log streaming is on (see setLogStreaming). */
  log: string[];
  /** Turns native log events on while the diagnostics panel is open, and off when it closes. */
  setLogStreaming: (enabled: boolean) => void;
  /** Today's allowance from the last budget snapshot plus unsynced detections; null with no budget. */
  allowance: DailyAllowance | null;
  /** Saves pending detections to Supabase now; resolves when the drain ends. */
  syncNow: () => Promise<void>;
  syncing: boolean;
  /** Epoch ms of the last drain that finished without failures. */
  lastSyncAt: number | null;
  /** Bumps whenever a drain saved at least one payment; watch it to reload the ledger. */
  syncNonce: number;
  /** Same signal as syncNonce, as a callback. Returns an unsubscribe. */
  onSynced: (callback: () => void) => () => void;
  keep: (id: number) => Promise<void>;
  merge: (id: number) => Promise<void>;
  clearHistory: () => Promise<void>;
  shareReport: () => Promise<void>;
  /** The screen that owns the ledger calls this whenever transactions or the budget change. */
  setBudgetInputs: (inputs: {
    transactions: TransactionRow[];
    monthlyBudget: number;
    /** Payday the budget month starts on; null keeps calendar months. */
    payday?: number | null;
    /** Monthly bills due this budget month, taken off before day-to-day spending. */
    committed?: number;
    /** When the ledger fetch behind `transactions` started; 0 if unknown. */
    dataAsOfMillis?: number;
  }) => void;
};

const AutoTrackContext = createContext<AutoTrackValue | null>(null);

export function AutoTrackProvider({children}: {children: React.ReactNode}) {
  const {user} = useAuth();
  const userId = user?.id ?? null;
  const supported = native.isAutoTrackSupported();

  const [status, setStatus] = useState<DetectorStatus | null>(null);
  const [prefs, setPrefsState] = useState(DEFAULT_AUTO_TRACK_PREFS);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  // The user id native has been told about; nothing is read or drained before.
  const [ownerReady, setOwnerReady] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<DetectedTxn[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const [snapshot, setSnapshot] = useState<BudgetSnapshot | null>(null);
  const [loading, setLoading] = useState(supported);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncNonce, setSyncNonce] = useState(0);
  const [today, setToday] = useState(() => localDateISO());

  const userRef = useRef<string | null>(userId);
  userRef.current = userId;
  const prefsRef = useRef(prefs);
  const prefsLoadedRef = useRef(false);
  const stagedPrefsRef = useRef<AutoTrackPrefs | null>(null);
  const ownerRef = useRef<string | null>(null);
  const logStreamingRef = useRef(false);
  const snapshotJson = useRef('');
  const listeners = useRef(new Set<() => void>());
  const signedInBefore = useRef(false);

  const refreshStatus = useCallback(async () => {
    if (supported) {
      setStatus(await native.getStatus());
    }
  }, [supported]);

  const refreshTransactions = useCallback(async () => {
    const owner = ownerRef.current;
    if (!supported || !owner) {
      return;
    }
    const next = await native.getTransactions();
    if (ownerRef.current === owner) {
      setTransactions(next);
    }
  }, [supported]);

  // The log is only read while the diagnostics panel is open.
  const refreshLog = useCallback(async () => {
    if (supported && logStreamingRef.current) {
      setLog(await native.getLog());
    }
  }, [supported]);

  const setLogStreaming = useCallback(
    (enabled: boolean) => {
      if (!supported) {
        return;
      }
      logStreamingRef.current = enabled;
      native.setLogStreaming(enabled);
      if (enabled) {
        refreshLog();
      } else {
        setLog([]);
      }
    },
    [refreshLog, supported],
  );

  const refreshAll = useCallback(
    () =>
      Promise.all([refreshStatus(), refreshTransactions(), refreshLog()]).then(
        () => {},
      ),
    [refreshLog, refreshStatus, refreshTransactions],
  );

  const drain = useMemo(
    () =>
      createSyncDrain({
        enabled: () =>
          supported && userId !== null && ownerRef.current === userId,
        getPending: native.getPending,
        save: pending => upsertDetectedTransaction(pending, userId as string),
        ack: native.ackSynced,
        onRunningChange: setSyncing,
      }),
    [supported, userId],
  );

  const runDrain = useCallback(async () => {
    const result = await drain.run();
    if (result.skipped || ownerRef.current !== userId) {
      return;
    }
    if (result.acked > 0) {
      setSyncNonce(value => value + 1);
      listeners.current.forEach(listener => {
        try {
          listener();
        } catch {
          // One listener failing must not stop the others.
        }
      });
      await refreshTransactions();
    }
    if (result.failed === 0) {
      setLastSyncAt(Date.now());
    }
  }, [drain, refreshTransactions, userId]);

  // Per user: tell native who owns the detections, load their toggles, mirror
  // them to native, read the detector, and save anything it found while the
  // app was closed. Nothing touches detections before the owner is set.
  useEffect(() => {
    let cancelled = false;
    ownerRef.current = null;
    setOwnerReady(null);
    setPrefsState(DEFAULT_AUTO_TRACK_PREFS);
    prefsRef.current = DEFAULT_AUTO_TRACK_PREFS;
    prefsLoadedRef.current = false;
    setPrefsLoaded(false);
    setTransactions([]);
    setLog([]);
    setLastSyncAt(null);

    if (!userId) {
      // The ledger screen's effects run before this one, so the snapshot is
      // only dropped on sign-out, never when a user arrives.
      setSnapshot(null);
      snapshotJson.current = '';
    }

    if (!supported) {
      setLoading(false);
      return;
    }

    if (!userId) {
      // Only a real sign-out forgets native state; a cold start passes through
      // "no user" before the stored session is restored.
      if (signedInBefore.current) {
        signedInBefore.current = false;
        native.setOwner(null).then(() => native.clearUserData(false));
      }
      setLoading(false);
      setStatus(null);
      return;
    }
    signedInBefore.current = true;

    setLoading(true);
    (async () => {
      if (!(await native.setOwner(userId)) || cancelled) {
        if (!cancelled) {
          setLoading(false);
        }
        return;
      }
      ownerRef.current = userId;
      setOwnerReady(userId);
      const staged = stagedPrefsRef.current;
      const stored = staged ?? (await loadAutoTrackPrefs(userId));
      if (cancelled) {
        return;
      }
      if (staged) {
        stagedPrefsRef.current = null;
        saveAutoTrackPrefs(userId, staged).catch(() => {});
      }
      prefsRef.current = stored;
      prefsLoadedRef.current = true;
      setPrefsState(stored);
      setPrefsLoaded(true);
      await native.setPreferences(stored);
      await refreshAll();
      if (cancelled) {
        return;
      }
      setLoading(false);
      await runDrain();
    })().catch(() => {
      if (!cancelled) {
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [refreshAll, runDrain, supported, userId]);

  // Leaving with the log panel open must not leave native streaming it.
  useEffect(
    () => () => {
      if (logStreamingRef.current) {
        logStreamingRef.current = false;
        native.setLogStreaming(false);
      }
    },
    [],
  );

  // Coming back to the app: permissions may have changed in system settings,
  // payments may have been detected, and the day may have rolled over.
  useEffect(() => {
    if (!supported || !ownerReady) {
      return;
    }
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        setToday(localDateISO());
        refreshAll();
        runDrain();
      }
    });
    return () => subscription.remove();
  }, [ownerReady, refreshAll, runDrain, supported]);

  useEffect(() => {
    if (!supported || !ownerReady) {
      return;
    }
    return native.subscribeToDetector((reason: DetectorChangeReason | null) => {
      if (reason === 'status') {
        refreshStatus();
      } else if (reason === 'log') {
        refreshLog();
      } else {
        refreshTransactions();
        refreshLog();
        runDrain();
      }
    });
  }, [
    refreshLog,
    refreshStatus,
    refreshTransactions,
    runDrain,
    supported,
    ownerReady,
  ]);

  const updatePrefs = useCallback((patch: Partial<AutoTrackPrefs>) => {
    const owner = userRef.current;
    if (!owner || !prefsLoadedRef.current) {
      return;
    }
    const next = {...prefsRef.current, ...patch};
    prefsRef.current = next;
    setPrefsState(next);
    saveAutoTrackPrefs(owner, next).catch(() => {});
    native.setPreferences(next);
  }, []);

  const stagePrefs = useCallback(
    (next: AutoTrackPrefs) => {
      if (userRef.current && prefsLoadedRef.current) {
        updatePrefs(next);
      } else {
        stagedPrefsRef.current = next;
      }
    },
    [updatePrefs],
  );

  const setBudgetInputs = useCallback(
    (inputs: {
      transactions: TransactionRow[];
      monthlyBudget: number;
      payday?: number | null;
      committed?: number;
      dataAsOfMillis?: number;
    }) => {
      const next = buildBudgetSnapshot(
        inputs.transactions,
        {
          monthlyBudget: inputs.monthlyBudget,
          payday: inputs.payday,
          committed: inputs.committed,
        },
        new Date(),
        inputs.dataAsOfMillis ?? 0,
      );
      const json = JSON.stringify(next);
      if (json === snapshotJson.current) {
        return;
      }
      snapshotJson.current = json;
      setSnapshot(next);
      native.setBudgetSnapshot(next);
    },
    [],
  );

  const syncNow = useCallback(async () => {
    await runDrain();
  }, [runDrain]);

  const onSynced = useCallback((callback: () => void) => {
    listeners.current.add(callback);
    return () => {
      listeners.current.delete(callback);
    };
  }, []);

  const keep = useCallback(
    async (id: number) => {
      await native.keep(id);
      await refreshTransactions();
      runDrain();
    },
    [refreshTransactions, runDrain],
  );

  const merge = useCallback(
    async (id: number) => {
      await native.merge(id);
      await refreshTransactions();
      runDrain();
    },
    [refreshTransactions, runDrain],
  );

  const clearHistory = useCallback(async () => {
    await native.clear();
    await Promise.all([refreshTransactions(), refreshLog()]);
  }, [refreshLog, refreshTransactions]);

  const shareReport = useCallback(async () => {
    const message = await native.buildReport();
    if (!message) {
      return;
    }
    try {
      await Share.share({message});
    } catch {
      // A dismissed or failed share sheet is not worth surfacing.
    }
  }, []);

  const allowance = useMemo(
    () =>
      snapshot
        ? dailyAllowance(
            snapshot,
            today,
            unsyncedSpendByDate(transactions, snapshot.dataAsOfMillis),
          )
        : null,
    [snapshot, today, transactions],
  );

  const value = useMemo<AutoTrackValue>(
    () => ({
      supported,
      loading,
      status,
      refreshStatus,
      prefs,
      prefsLoaded,
      updatePrefs,
      stagePrefs,
      transactions,
      log,
      setLogStreaming,
      allowance,
      syncNow,
      syncing,
      lastSyncAt,
      syncNonce,
      onSynced,
      keep,
      merge,
      clearHistory,
      shareReport,
      setBudgetInputs,
    }),
    [
      allowance,
      clearHistory,
      keep,
      lastSyncAt,
      loading,
      log,
      merge,
      onSynced,
      prefs,
      prefsLoaded,
      refreshStatus,
      setBudgetInputs,
      setLogStreaming,
      shareReport,
      stagePrefs,
      status,
      supported,
      syncNonce,
      syncNow,
      syncing,
      transactions,
      updatePrefs,
    ],
  );

  return (
    <AutoTrackContext.Provider value={value}>
      {children}
    </AutoTrackContext.Provider>
  );
}

export function useAutoTrack() {
  const value = useContext(AutoTrackContext);
  if (!value) {
    throw new Error('useAutoTrack must be used inside AutoTrackProvider');
  }
  return value;
}
