import {
  Inter_500Medium,
  Inter_600SemiBold,
} from '@expo-google-fonts/inter';
import {
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import {useFonts} from 'expo-font';

import {fonts} from './typography';

/**
 * Registers the same PostScript names used in `fonts`, so existing
 * `fontFamily: 'Outfit-Bold'` calls resolve. iOS drops a face if you also
 * set `fontWeight` against a named file — keep weight off those styles.
 */
export function useAppFonts() {
  const [loaded] = useFonts({
    [fonts.outfitBold]: Outfit_700Bold,
    [fonts.outfitSemi]: Outfit_600SemiBold,
    [fonts.interMedium]: Inter_500Medium,
    [fonts.interSemi]: Inter_600SemiBold,
  });
  return loaded;
}
