import AsyncStorage from '@react-native-async-storage/async-storage';

import type {TutorialSection} from '../features/tutorial/tutorialSteps';
import {supabase} from './supabase/client';

// Bump the version to show reworked tips to everyone once more.
const STORAGE_PREFIX = 'paisa:tutorial:v1:';
/** Set by the first, single-tour version: counts as every screen seen. */
export const LEGACY_METADATA_KEY = 'tutorial_completed_at';

export function sectionMetadataKey(section: TutorialSection): string {
  return `tutorial_${section}_seen_at`;
}

function storageKey(userId: string, section: TutorialSection): string {
  return `${STORAGE_PREFIX}${userId}:${section}`;
}

/**
 * The screens whose tips this account has finished or skipped. The account's
 * auth metadata carries them across devices and reinstalls; the device copy
 * keeps them when a metadata update has not gone through (offline, say).
 */
export async function loadSeenSections(
  userId: string,
  sections: readonly TutorialSection[],
  userMetadata?: Record<string, unknown> | null,
): Promise<Set<TutorialSection>> {
  const seen = new Set<TutorialSection>();
  for (const section of sections) {
    if (
      userMetadata?.[LEGACY_METADATA_KEY] ||
      userMetadata?.[sectionMetadataKey(section)]
    ) {
      seen.add(section);
      continue;
    }
    try {
      if ((await AsyncStorage.getItem(storageKey(userId, section))) !== null) {
        seen.add(section);
      }
    } catch {
      // Unreadable storage shows the tips again, which is harmless.
    }
  }
  return seen;
}

/** Records one screen's tips as done, on the device first, then the account. */
export async function markSectionSeen(
  userId: string,
  section: TutorialSection,
  now = new Date(),
): Promise<void> {
  const stamp = now.toISOString();
  try {
    await AsyncStorage.setItem(storageKey(userId, section), stamp);
  } catch {
    // The account copy below still covers it.
  }
  try {
    await supabase.auth.updateUser({
      data: {[sectionMetadataKey(section)]: stamp},
    });
  } catch {
    // Best effort: the device copy above already stops it showing again here.
  }
}

/** Settings → Replay: every screen shows its tips again on the next visit. */
export async function resetTutorial(
  userId: string,
  sections: readonly TutorialSection[],
): Promise<void> {
  try {
    await Promise.all(
      sections.map(section =>
        AsyncStorage.removeItem(storageKey(userId, section)),
      ),
    );
  } catch {
    // Nothing stored is the same as reset.
  }
  const cleared: Record<string, null> = {[LEGACY_METADATA_KEY]: null};
  for (const section of sections) {
    cleared[sectionMetadataKey(section)] = null;
  }
  try {
    await supabase.auth.updateUser({data: cleared});
  } catch {
    // Offline: this device replays now; others keep their saved state.
  }
}
