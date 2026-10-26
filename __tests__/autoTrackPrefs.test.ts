import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  clearAutoTrackPrefs,
  loadAutoTrackPrefs,
  saveAutoTrackPrefs,
} from '../src/lib/autotrack/autoTrackPrefs';

describe('auto-track prefs', () => {
  it('defaults both toggles to on', async () => {
    expect(await loadAutoTrackPrefs('fresh')).toEqual({
      notesEnabled: true,
      blockingEnabled: true,
    });
  });

  it('saves and loads per user', async () => {
    await saveAutoTrackPrefs('a', {notesEnabled: false, blockingEnabled: true});
    await saveAutoTrackPrefs('b', {notesEnabled: true, blockingEnabled: false});
    expect(await loadAutoTrackPrefs('a')).toEqual({
      notesEnabled: false,
      blockingEnabled: true,
    });
    expect(await loadAutoTrackPrefs('b')).toEqual({
      notesEnabled: true,
      blockingEnabled: false,
    });
  });

  it('keeps the key stable for the account cleanup', async () => {
    await saveAutoTrackPrefs('key-user', {
      notesEnabled: false,
      blockingEnabled: false,
    });
    expect(await AsyncStorage.getItem('sikka.autotrack.prefs.key-user')).toBe(
      JSON.stringify({notesEnabled: false, blockingEnabled: false}),
    );
  });

  it('falls back per field when stored values are wrong', async () => {
    await AsyncStorage.setItem(
      'sikka.autotrack.prefs.messy',
      JSON.stringify({notesEnabled: 'no', blockingEnabled: false, extra: 1}),
    );
    expect(await loadAutoTrackPrefs('messy')).toEqual({
      notesEnabled: true,
      blockingEnabled: false,
    });
  });

  it('falls back to defaults for unreadable storage', async () => {
    await AsyncStorage.setItem('sikka.autotrack.prefs.broken', '{not json');
    expect(await loadAutoTrackPrefs('broken')).toEqual({
      notesEnabled: true,
      blockingEnabled: true,
    });
  });

  it('clears one user without touching another', async () => {
    await saveAutoTrackPrefs('x', {notesEnabled: false, blockingEnabled: false});
    await saveAutoTrackPrefs('y', {notesEnabled: false, blockingEnabled: false});
    await clearAutoTrackPrefs('x');
    expect((await loadAutoTrackPrefs('x')).notesEnabled).toBe(true);
    expect((await loadAutoTrackPrefs('y')).notesEnabled).toBe(false);
  });
});
