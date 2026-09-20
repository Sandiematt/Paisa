import {useCallback, useEffect, useRef, useState} from 'react';

import {generateInsights, InsightPeriod, InsightsResponse} from '../../lib/supabase/insights';
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

  const [data, setData] = useState<InsightsResponse | null>(() => cacheRef.current.get(period) ?? null);
  const [status, setStatus] = useState<InsightsFetchStatus>(cacheRef.current.has(period) ? 'ready' : 'loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (targetPeriod: InsightPeriod, options: {background?: boolean} = {}) => {
      if (!user) {
        setData(null);
        setStatus('ready');
        return;
      }
      if (!options.background) {
        setStatus('loading');
        setError(null);
      }
      try {
        const response = await generateInsights({period: targetPeriod});
        cacheRef.current.set(targetPeriod, response);
        setData(response);
        setStatus('ready');
        setError(null);
      } catch (caught) {
        // If we already have cached data for this period, keep showing it
        // rather than replacing it with an error state on a background refresh.
        if (!cacheRef.current.has(targetPeriod)) {
          setError(caught instanceof Error ? caught.message : 'Could not load insights.');
          setStatus('error');
        }
      }
    },
    [user],
  );

  useEffect(() => {
    const cached = cacheRef.current.get(period);
    if (cached) {
      setData(cached);
      setStatus('ready');
      load(period, {background: true});
    } else {
      setData(null);
      load(period);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, user]);

  const reload = useCallback(() => load(period), [load, period]);

  return {data, status, error, reload};
}
