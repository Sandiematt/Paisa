import {useCallback, useEffect, useRef, useState} from 'react';

import {generateInsights, InsightPeriod, InsightsResponse} from '../../lib/supabase/insights';
import {localDateISO} from '../../lib/transactionsStore';
import {useAuth} from '../auth/AuthProvider';

export type InsightsFetchStatus = 'loading' | 'ready' | 'error';

/**
 * Fetches the AI-summarized, backend-calculated insight for a given period
 * (week/month/year) from the `generate-insights` Edge Function.
 *
 * Caches the last response per period in memory: switching back to a period
 * that was already loaded shows it instantly (status "ready") while quietly
 * refetching in the background, instead of re-showing a loading state every
 * time the user taps a tab they've already visited.
 */
export function useInsights(period: InsightPeriod) {
  const {user} = useAuth();
  const cacheRef = useRef<Map<InsightPeriod, InsightsResponse>>(new Map());

  const periodRef = useRef<InsightPeriod>(period);
  periodRef.current = period;
  // Whatever is on screen. Deliberately NOT cleared on a period change: the old
  // numbers stay visible until the new ones arrive, so the screen never blanks
  // out into a skeleton and back.
  const dataRef = useRef<InsightsResponse | null>(null);

  const [data, setDataState] = useState<InsightsResponse | null>(null);
  const [status, setStatus] = useState<InsightsFetchStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  const setData = useCallback((next: InsightsResponse | null) => {
    dataRef.current = next;
    setDataState(next);
  }, []);

  const load = useCallback(
    async (targetPeriod: InsightPeriod, options: {background?: boolean} = {}) => {
      if (!user) {
        setData(null);
        setStatus('ready');
        setIsFetching(false);
        return;
      }
      setIsFetching(true);
      if (!options.background) {
        // Only a true first load (nothing to show yet) is a "loading" state.
        if (dataRef.current === null) setStatus('loading');
        setError(null);
      }
      try {
        // The server's own "today" is UTC; transactions carry the device's local date.
        const response = await generateInsights({period: targetPeriod, referenceDate: localDateISO()});
        // A generate-insights deployment from before the year period falls back to
        // week for an unknown period. Never show that as if it were the year.
        if (response.stats.period !== targetPeriod) {
          throw new Error('This view needs the latest server update.');
        }
        cacheRef.current.set(targetPeriod, response);
        // Ignore responses for a period the user has already moved away from.
        if (periodRef.current !== targetPeriod) return;
        setData(response);
        setStatus('ready');
        setError(null);
        setIsFetching(false);
      } catch (caught) {
        if (periodRef.current !== targetPeriod) return;
        setIsFetching(false);
        // If we already have cached data for this period, keep showing it
        // rather than replacing it with an error state on a background refresh.
        if (!cacheRef.current.has(targetPeriod)) {
          setData(null);
          setError(caught instanceof Error ? caught.message : 'Could not load insights.');
          setStatus('error');
        }
      }
    },
    [user, setData],
  );

  useEffect(() => {
    const cached = cacheRef.current.get(period);
    if (cached) {
      setData(cached);
      setStatus('ready');
      load(period, {background: true});
    } else {
      // Keep the previous period's data on screen while this one loads.
      load(period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, user]);

  /** Retry from scratch: shows the loading state again. */
  const reload = useCallback(() => load(period), [load, period]);
  /** Pull-to-refresh: keeps whatever is on screen and swaps data in when it arrives. */
  const refresh = useCallback(() => load(period, {background: true}), [load, period]);

  return {data, status, error, isFetching, reload, refresh};
}
