import AsyncStorage from '@react-native-async-storage/async-storage';

import {AutoTrackPrefs, DEFAULT_AUTO_TRACK_PREFS} from './types';

const prefsKey = (userId: string) => `sikka.autotrack.prefs.${userId}`;

function asFlag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export async function loadAutoTrackPrefs(
  userId: string,
): Promise<AutoTrackPrefs> {
  let stored: Partial<AutoTrackPrefs> | null = null;
  try {
    const raw = await AsyncStorage.getItem(prefsKey(userId));
    stored = raw ? (JSON.parse(raw) as Partial<AutoTrackPrefs>) : null;
  } catch {
    stored = null;
  }
  const defaults = DEFAULT_AUTO_TRACK_PREFS;
  return {
    notesEnabled: asFlag(stored?.notesEnabled, defaults.notesEnabled),
    blockingEnabled: asFlag(stored?.blockingEnabled, defaults.blockingEnabled),
  };
}

export async function saveAutoTrackPrefs(
  userId: string,
  prefs: AutoTrackPrefs,
): Promise<void> {
  await AsyncStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
}

export async function clearAutoTrackPrefs(userId: string): Promise<void> {
  await AsyncStorage.removeItem(prefsKey(userId));
}
