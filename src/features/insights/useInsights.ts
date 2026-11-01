import {useCallback, useEffect, useRef, useState} from 'react';

import {generateInsights, InsightPeriod, InsightsResponse} from '../../lib/supabase/insights';
import {localDateISO} from '../../lib/transactionsStore';
import {useAuth} from '../auth/AuthProvider';

export type InsightsFetchStatus = 'loading' | 'ready' | 'error';

const PERIODS: InsightPeriod[] = ['week', 'month', 'year'];

/**
 * Fetches the AI-summarized, backend-calculated insight for a given period
 * (week/month/year) from the `generate-insights` Edge Function.
 *
 * Caches the last response per period in memory: switching back to a period
 * that was already loaded shows it instantly (status "ready") while quietly
 * refetching in the background. Once the first period loads, the other two are
 * prefetched, so switching tabs is normally instant. Switching to a period that
 * is still loading shows the loading state, never the previous period's numbers
 * under the new tab.
 */
export function useInsights(period: InsightPeriod) {
  const {user} = useAuth();
  const userId = user?.id ?? null;
  const cacheRef = useRef<Map<InsightPeriod, InsightsResponse>>(new Map());
  // One request per period at a time: a tab switch joins a prefetch already in flight.
  const inflightRef = useRef<Map<InsightPeriod, Promise<InsightsResponse>>>(new Map());
  // Bumped when the signed-in user changes, so a late response for the old user never lands in the cache.
  const generationRef = useRef(0);
  const cacheOwnerRef = useRef<string | null>(userId);
  if (cacheOwnerRef.current !== userId) {
    cacheOwnerRef.current = userId;
    cacheRef.current.clear();
    inflightRef.current.clear();
    generationRef.current += 1;
  }

  const periodRef = useRef<InsightPeriod>(period);
  periodRef.current = period;
  const dataRef = useRef<InsightsResponse | null>(null);

  const [data, setDataState] = useState<InsightsResponse | null>(null);
  const [status, setStatus] = useState<InsightsFetchStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(true);

  const setData = useCallback((next: InsightsResponse | null) => {
    dataRef.current = next;
    setDataState(next);
  }, []);

  const request = useCallback((targetPeriod: InsightPeriod, force = false): Promise<InsightsResponse> => {
    const existing = inflightRef.current.get(targetPeriod);
    if (existing && !force) return existing;
    const generation = generationRef.current;
    // The server's own "today" is UTC; transactions carry the device's local date.
    const promise = generateInsights({period: targetPeriod, referenceDate: localDateISO()})
      .then(response => {
        // A generate-insights deployment from before the year period falls back to
        // week for an unknown period. Never show that as if it were the year.
        if (response.stats.period !== targetPeriod) {
          throw new Error('This view needs the latest server update.');
        }
        if (generation === generationRef.current) cacheRef.current.set(targetPeriod, response);
        return response;
      })
      .finally(() => {
        if (inflightRef.current.get(targetPeriod) === promise) inflightRef.current.delete(targetPeriod);
      });
    inflightRef.current.set(targetPeriod, promise);
    return promise;
  }, []);

  /** Warms the cache for the periods the user hasn't opened yet. */
  const prefetchOthers = useCallback(
    (loaded: InsightPeriod) => {
      for (const other of PERIODS) {
        if (other === loaded || cacheRef.current.has(other) || inflightRef.current.has(other)) continue;
        request(other).catch(() => {
          // Prefetch is best effort; opening that tab retries and reports errors.
        });
      }
    },
    [request],
  );

  const load = useCallback(
    async (targetPeriod: InsightPeriod, options: {background?: boolean; force?: boolean} = {}) => {
      if (!user) {
        setData(null);
        setStatus('ready');
        setIsFetching(false);
        return;
      }
      setIsFetching(true);
      if (!options.background) {
        // Only a load with nothing to show is a "loading" state.
        if (dataRef.current === null) setStatus('loading');
        setError(null);
      }
      try {
        const response = await request(targetPeriod, options.force);
        // Ignore responses for a period the user has already moved away from.
        if (periodRef.current !== targetPeriod) return;
        setData(response);
        setStatus('ready');
        setError(null);
        setIsFetching(false);
        prefetchOthers(targetPeriod);
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
    [user, setData, request, prefetchOthers],
  );

  useEffect(() => {
    const cached = cacheRef.current.get(period);
    if (cached) {
      setData(cached);
      setStatus('ready');
      load(period, {background: true});
    } else {
      // Nothing for this period yet: show the loading state rather than the
      // previous period's numbers under the newly selected tab.
      setData(null);
      load(period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, user]);

  /** Retry from scratch: shows the loading state again. */
  const reload = useCallback(() => load(period, {force: true}), [load, period]);
  /** Pull-to-refresh: keeps whatever is on screen and swaps data in when it arrives. */
  const refresh = useCallback(() => load(period, {background: true, force: true}), [load, period]);

  return {data, status, error, isFetching, reload, refresh};
}
