import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import {useFonts} from 'expo-font';

import {fonts} from './typography';

/**
 * Registers Plus Jakarta Sans 400-800 under the PostScript-style names in
 * `fonts`. iOS drops a face if you also set `fontWeight` against a named file,
 * so keep weight off styles that use these families. The legacy Outfit/Inter
 * names now alias Jakarta faces, so nothing else needs registering.
 */
export function useAppFonts() {
  const [loaded] = useFonts({
    [fonts.jakartaRegular]: PlusJakartaSans_400Regular,
    [fonts.jakartaMedium]: PlusJakartaSans_500Medium,
    [fonts.jakartaSemiBold]: PlusJakartaSans_600SemiBold,
    [fonts.jakartaBold]: PlusJakartaSans_700Bold,
    [fonts.jakartaExtraBold]: PlusJakartaSans_800ExtraBold,
  });
  return loaded;
}
