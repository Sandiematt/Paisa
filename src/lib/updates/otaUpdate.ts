import type {
  UpdateCheckResult,
  UpdateFetchResult,
} from 'expo-updates';

/**
 * Where the over-the-air update flow stands. Only `downloading` and `ready`
 * are ever shown to the user; every failure lands on `idle` again, quietly.
 */
export type OtaStatus = 'idle' | 'checking' | 'downloading' | 'ready';

/** The slice of `expo-updates` the flow needs; tests pass a fake. */
export type UpdatesApi = {
  isEnabled: boolean;
  checkForUpdateAsync: () => Promise<UpdateCheckResult>;
  fetchUpdateAsync: () => Promise<UpdateFetchResult>;
};

export type RunUpdateOptions = {
  /** Upper bound for the manifest check. Slow networks give up, not hang. */
  checkTimeoutMs?: number;
  /** Upper bound for downloading the bundle and its assets. */
  fetchTimeoutMs?: number;
  log?: (message: string, error?: unknown) => void;
};

export const CHECK_TIMEOUT_MS = 10_000;
export const FETCH_TIMEOUT_MS = 90_000;
/** Foreground re-checks wait this long after the last one. */
export const RECHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

/**
 * Rejects if `promise` has not settled within `ms`. The underlying native
 * call keeps running; a late result is simply ignored.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      value => {
        clearTimeout(timer);
        resolve(value);
      },
      error => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Dev-only console output; release builds stay silent. */
export const logUpdateIssue = (message: string, error?: unknown) => {
  if (__DEV__) {
    console.warn(`[updates] ${message}`, error ?? '');
  }
};

/**
 * One pass of check, then download. Reports `checking` / `downloading` through
 * `onStatus` and resolves with where it ended: `ready` when a new bundle (or a
 * roll-back to the embedded one) is staged for the next launch, `idle`
 * otherwise. Never rejects: offline, server errors and timeouts are logged and
 * treated as "nothing to do". It never reloads; that is the user's call.
 */
export async function runUpdateCheck(
  api: UpdatesApi,
  onStatus: (status: OtaStatus) => void,
  {
    checkTimeoutMs = CHECK_TIMEOUT_MS,
    fetchTimeoutMs = FETCH_TIMEOUT_MS,
    log = logUpdateIssue,
  }: RunUpdateOptions = {},
): Promise<OtaStatus> {
  if (!api.isEnabled) {
    return 'idle';
  }

  onStatus('checking');
  let check: UpdateCheckResult;
  try {
    check = await withTimeout(
      api.checkForUpdateAsync(),
      checkTimeoutMs,
      'Update check',
    );
  } catch (error) {
    log('check failed', error);
    onStatus('idle');
    return 'idle';
  }

  if (!check.isAvailable && !check.isRollBackToEmbedded) {
    onStatus('idle');
    return 'idle';
  }

  onStatus('downloading');
  try {
    const fetched = await withTimeout(
      api.fetchUpdateAsync(),
      fetchTimeoutMs,
      'Update download',
    );
    const next: OtaStatus =
      fetched.isNew || fetched.isRollBackToEmbedded ? 'ready' : 'idle';
    onStatus(next);
    return next;
  } catch (error) {
    log('download failed', error);
    onStatus('idle');
    return 'idle';
  }
}

/** Whether a foreground return should trigger another check. */
export function shouldRecheck(
  status: OtaStatus,
  lastCheckedAt: number | null,
  now: number,
  interval: number = RECHECK_INTERVAL_MS,
): boolean {
  if (status !== 'idle') {
    return false;
  }
  return lastCheckedAt === null || now - lastCheckedAt >= interval;
}
