import AsyncStorage from '@react-native-async-storage/async-storage';

import {rolloverCapOf} from './budgetEngine';
import {supabase} from './supabase/client';
import {isMissingSchema} from './supabase/schema';

/**
 * The account's rollover cap (budgetEngine MonthInputs.rolloverCap), kept on
 * the profile row (supabase/migrations/20261101120000_rollover_cap.sql) so
 * every device, and the phone's spend guard, use the same one. Null is no cap.
 */

const cacheKey = (userId: string) => `paisa.rolloverCap.${userId}`;

/**
 * The saved cap, null for none or when the database cannot hold one yet.
 * Falls back to the last copy on this phone offline.
 */
export async function loadRolloverCap(userId: string): Promise<number | null> {
  const {data, error} = await supabase
    .from('profiles')
    .select('rollover_cap')
    .eq('id', userId)
    .maybeSingle();
  if (isMissingSchema(error)) {
    return null;
  }
  if (!error) {
    const cap = rolloverCapOf((data as {rollover_cap: number | string | null} | null)?.rollover_cap);
    await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(cap)).catch(() => {});
    return cap;
  }
  const cached = await AsyncStorage.getItem(cacheKey(userId)).catch(() => null);
  if (cached) {
    try {
      return rolloverCapOf(JSON.parse(cached));
    } catch {
      // Fall through to the error.
    }
  }
  throw new Error('Could not load your budget. Check your connection.');
}

export async function saveRolloverCap(userId: string, cap: number | null): Promise<void> {
  const value = rolloverCapOf(cap);
  const {error} = await supabase.from('profiles').update({rollover_cap: value}).eq('id', userId);
  if (isMissingSchema(error)) {
    throw new Error('Paisa needs a quick server update before it can save this. Try again later.');
  }
  if (error) {
    throw error;
  }
  await AsyncStorage.setItem(cacheKey(userId), JSON.stringify(value)).catch(() => {});
}
