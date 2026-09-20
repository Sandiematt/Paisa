import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sikka.companion.prefs';

export type CompanionPrefs = {
  autoCategorize: boolean;
  tone: 'short' | 'detailed';
};

export const DEFAULT_COMPANION_PREFS: CompanionPrefs = {
  autoCategorize: true,
  tone: 'short',
};

export async function loadCompanionPrefs(): Promise<CompanionPrefs> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      return DEFAULT_COMPANION_PREFS;
    }
    const parsed = JSON.parse(raw) as Partial<CompanionPrefs>;
    return {
      autoCategorize: parsed.autoCategorize !== false,
      tone: parsed.tone === 'detailed' ? 'detailed' : 'short',
    };
  } catch {
    return DEFAULT_COMPANION_PREFS;
  }
}

export async function saveCompanionPrefs(prefs: CompanionPrefs): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
}
