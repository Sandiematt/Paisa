import * as Updates from 'expo-updates';
import {useCallback, useEffect, useRef, useState} from 'react';
import {AppState} from 'react-native';

import {
  OtaStatus,
  RunUpdateOptions,
  logUpdateIssue,
  UpdatesApi,
  runUpdateCheck,
  shouldRecheck,
} from '../../lib/updates/otaUpdate';

export type OtaUpdate = {
  status: OtaStatus;
  /** The user closed the banner; the staged update still applies on next cold start. */
  dismissed: boolean;
  /** Reloads into the staged update. Only ever called from a user tap. */
  restart: () => Promise<void>;
  dismiss: () => void;
};

type UseOtaUpdateOptions = RunUpdateOptions & {
  api?: UpdatesApi & {reloadAsync: () => Promise<void>};
  /** Off in development and whenever expo-updates is disabled. */
  enabled?: boolean;
  now?: () => number;
};

const defaultApi = {
  isEnabled: Updates.isEnabled,
  checkForUpdateAsync: () => Updates.checkForUpdateAsync(),
  fetchUpdateAsync: () => Updates.fetchUpdateAsync(),
  reloadAsync: () => Updates.reloadAsync(),
};

/**
 * Checks EAS Update on launch and again when the app returns to the
 * foreground (at most every few hours), downloading in the background. A
 * downloaded update is never applied mid-session: it waits for the user to
 * tap Restart, or for the next cold start, which picks it up natively.
 */
export function useOtaUpdate({
  api = defaultApi,
  enabled = api.isEnabled && !__DEV__,
  now = Date.now,
  ...runOptions
}: UseOtaUpdateOptions = {}): OtaUpdate {
  const [status, setStatus] = useState<OtaStatus>('idle');
  const [dismissed, setDismissed] = useState(false);
  const statusRef = useRef<OtaStatus>('idle');
  const lastCheckedAt = useRef<number | null>(null);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  // Options are read at call time, so a fresh object each render is fine.
  const latest = useRef({api, runOptions, now});
  latest.current = {api, runOptions, now};

  const check = useCallback(async () => {
    if (inFlight.current) {
      return;
    }
    inFlight.current = true;
    const {api: updates, runOptions: options, now: clock} = latest.current;
    lastCheckedAt.current = clock();
    await runUpdateCheck(
      updates,
      next => {
        statusRef.current = next;
        if (mounted.current) {
          setStatus(next);
        }
      },
      options,
    );
    inFlight.current = false;
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!enabled) {
      return () => {
        mounted.current = false;
      };
    }
    check();
    const sub = AppState.addEventListener('change', state => {
      if (
        state === 'active' &&
        shouldRecheck(
          statusRef.current,
          lastCheckedAt.current,
          latest.current.now(),
        )
      ) {
        check();
      }
    });
    return () => {
      mounted.current = false;
      sub.remove();
    };
  }, [check, enabled]);

  const restart = useCallback(async () => {
    try {
      await latest.current.api.reloadAsync();
    } catch (error) {
      // The update stays staged and applies on the next cold start.
      (latest.current.runOptions.log ?? logUpdateIssue)('reload failed', error);
      if (mounted.current) {
        setDismissed(true);
      }
    }
  }, []);

  const dismiss = useCallback(() => setDismissed(true), []);

  return {status, dismissed, restart, dismiss};
}
