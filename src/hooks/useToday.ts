import {useEffect, useState} from 'react';
import {AppState} from 'react-native';

import {localDateISO} from '../lib/transactionsStore';

/**
 * Today's local date, `YYYY-MM-DD`. It moves on at midnight and whenever the
 * app comes back to the foreground, so limits worked out from it start the
 * new day without a reload.
 */
export function useToday(): string {
  const [today, setToday] = useState(() => localDateISO());

  useEffect(() => {
    const refresh = () => setToday(localDateISO());
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const timer = setTimeout(refresh, midnight.getTime() - now.getTime());
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') {
        refresh();
      }
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [today]);

  return today;
}
