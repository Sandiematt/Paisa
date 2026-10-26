import {NativeEventEmitter, NativeModules, Platform} from 'react-native';

import {
  AckEntry,
  AutoTrackPrefs,
  BudgetSnapshot,
  DEFAULT_AUTO_TRACK_PREFS,
  DailyAllowance,
  DetectedTxn,
  DetectorChangeReason,
  DetectorStatus,
  PendingTxn,
  UPI_DETECTOR_EVENT,
} from './types';

/**
 * Typed wrapper over the Kotlin `UpiDetector` module. Everything native
 * resolves a JSON string (or null); this file parses it. Every call is safe:
 * off Android, with the module missing, or when native throws, it resolves an
 * empty value instead of rejecting, so callers never need a try/catch.
 */
type NativeUpiDetector = {
  getStatus(): Promise<string | null>;
  openAccessibilitySettings(): Promise<void>;
  openNotificationAccessSettings(): Promise<void>;
  getTransactions(): Promise<string | null>;
  getLog(): Promise<string | null>;
  getPending(): Promise<string | null>;
  /** JSON array of AckEntry. */
  ackSynced(entriesJson: string): Promise<void>;
  /** JSON AutoTrackPrefs. */
  setPreferences(prefsJson: string): Promise<void>;
  getPreferences(): Promise<string | null>;
  /** JSON BudgetSnapshot. */
  setBudgetSnapshot(snapshotJson: string): Promise<void>;
  getAllowance(): Promise<string | null>;
  keep(id: number): Promise<void>;
  merge(id: number): Promise<void>;
  clear(): Promise<void>;
  /** Plain-text report, not JSON. */
  buildReport(): Promise<string | null>;
  /** Scopes every other call to this user's detections; null while signed out. */
  setOwner(userId: string | null): Promise<void>;
  /** Forgets preferences and the budget snapshot; purgeHistory also deletes detections and the log. */
  clearUserData(purgeHistory: boolean): Promise<void>;
  /** Native only emits log changes while this is on. */
  setLogStreaming(enabled: boolean): Promise<void>;
};

const EMPTY_STATUS: DetectorStatus = {
  accessibilityEnabled: false,
  notificationAccessEnabled: false,
  installedApps: [],
};

function nativeModule(): NativeUpiDetector | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  return (NativeModules.UpiDetector as NativeUpiDetector | undefined) ?? null;
}

export function isAutoTrackSupported(): boolean {
  return nativeModule() !== null;
}

function parse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || raw.length === 0) {
    return fallback;
  }
  try {
    const value = JSON.parse(raw) as T | null;
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function asArray<T>(raw: unknown): T[] {
  const value = parse<unknown>(raw, []);
  return Array.isArray(value) ? (value as T[]) : [];
}

async function call<T>(
  run: (module: NativeUpiDetector) => Promise<T>,
  fallback: T,
): Promise<T> {
  const module = nativeModule();
  if (!module) {
    return fallback;
  }
  try {
    return await run(module);
  } catch {
    return fallback;
  }
}

export function getStatus(): Promise<DetectorStatus> {
  return call(async m => {
    const status = parse<Partial<DetectorStatus>>(await m.getStatus(), {});
    return {
      accessibilityEnabled: status.accessibilityEnabled === true,
      notificationAccessEnabled: status.notificationAccessEnabled === true,
      installedApps: Array.isArray(status.installedApps)
        ? status.installedApps
        : [],
    };
  }, EMPTY_STATUS);
}

export function openAccessibilitySettings(): Promise<void> {
  return call(m => m.openAccessibilitySettings(), undefined);
}

export function openNotificationAccessSettings(): Promise<void> {
  return call(m => m.openNotificationAccessSettings(), undefined);
}

export function getTransactions(): Promise<DetectedTxn[]> {
  return call(async m => asArray<DetectedTxn>(await m.getTransactions()), []);
}

export function getLog(): Promise<string[]> {
  return call(async m => asArray<unknown>(await m.getLog()).map(String), []);
}

export function getPending(): Promise<PendingTxn[]> {
  return call(async m => asArray<PendingTxn>(await m.getPending()), []);
}

/** Marks detections as saved remotely. Resolves false if native did not take it. */
export function ackSynced(entries: AckEntry[]): Promise<boolean> {
  if (entries.length === 0) {
    return Promise.resolve(true);
  }
  return call(async m => {
    await m.ackSynced(JSON.stringify(entries));
    return true;
  }, false);
}

export function setPreferences(prefs: AutoTrackPrefs): Promise<void> {
  return call(m => m.setPreferences(JSON.stringify(prefs)), undefined);
}

export function getPreferences(): Promise<AutoTrackPrefs> {
  return call(async m => {
    const stored = parse<Partial<AutoTrackPrefs>>(await m.getPreferences(), {});
    const defaults = DEFAULT_AUTO_TRACK_PREFS;
    return {
      notesEnabled:
        typeof stored.notesEnabled === 'boolean'
          ? stored.notesEnabled
          : defaults.notesEnabled,
      blockingEnabled:
        typeof stored.blockingEnabled === 'boolean'
          ? stored.blockingEnabled
          : defaults.blockingEnabled,
    };
  }, DEFAULT_AUTO_TRACK_PREFS);
}

export function setBudgetSnapshot(snapshot: BudgetSnapshot): Promise<void> {
  return call(m => m.setBudgetSnapshot(JSON.stringify(snapshot)), undefined);
}

/** The allowance native computes for the guard; null when there is no budget. */
export function getAllowance(): Promise<DailyAllowance | null> {
  return call(
    async m => parse<DailyAllowance | null>(await m.getAllowance(), null),
    null,
  );
}

export function keep(id: number): Promise<void> {
  return call(m => m.keep(id), undefined);
}

export function merge(id: number): Promise<void> {
  return call(m => m.merge(id), undefined);
}

export function clear(): Promise<void> {
  return call(m => m.clear(), undefined);
}

export function buildReport(): Promise<string> {
  return call(async m => (await m.buildReport()) ?? '', '');
}

/**
 * Makes `userId` the owner of everything native returns (null while signed
 * out). Resolves false if native did not take it; callers must not read or
 * drain detections then.
 */
export function setOwner(userId: string | null): Promise<boolean> {
  return call(async m => {
    await m.setOwner(userId);
    return true;
  }, false);
}

/**
 * Forgets preferences and the budget snapshot (sign-out). `purgeHistory` also
 * deletes the stored detections and log (account deletion).
 */
export function clearUserData(purgeHistory = false): Promise<void> {
  return call(m => m.clearUserData(purgeHistory), undefined);
}

export function setLogStreaming(enabled: boolean): Promise<void> {
  return call(m => m.setLogStreaming(enabled), undefined);
}

/** Calls back whenever the detector records something. Returns an unsubscribe. */
export function subscribeToDetector(
  callback: (reason: DetectorChangeReason | null) => void,
): () => void {
  const module = nativeModule();
  if (!module) {
    return () => {};
  }
  try {
    const emitter = new NativeEventEmitter(
      module as unknown as ConstructorParameters<typeof NativeEventEmitter>[0],
    );
    const subscription = emitter.addListener(
      UPI_DETECTOR_EVENT,
      (payload: unknown) => {
        const body =
          typeof payload === 'string'
            ? parse<{reason?: DetectorChangeReason}>(payload, {})
            : (payload as {reason?: DetectorChangeReason} | null);
        callback(body?.reason ?? null);
      },
    );
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}
