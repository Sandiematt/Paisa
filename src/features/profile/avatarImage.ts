import * as DocumentPicker from 'expo-document-picker';
import {Directory, File, Paths} from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type AvatarSource = 'library' | 'files' | 'camera';

export type AvatarPickResult =
  | {status: 'selected'; uri: string}
  | {status: 'cancelled'}
  | {status: 'denied'; canAskAgain: boolean};

export const AVATAR_SIZE_PX = 512;
const AVATAR_QUALITY = 0.7;
const AVATAR_DIR = 'avatars';
const AVATAR_PREFIX = 'avatar-';
/** Older copies kept so a not-yet-saved profile edit can still be cancelled. */
const KEEP_RECENT = 3;

/** True for avatars stored on this device (as opposed to remote https presets). */
export function isLocalAvatarUri(url: string | undefined): url is string {
  return !!url && url.startsWith('file://');
}

/**
 * Resizes to at most 512px wide, re-encodes as JPEG (~0.7) and copies the
 * result into the app's document directory, which survives restarts (the
 * picker/manipulator outputs live in the cache and can be purged).
 */
async function persistAvatar(sourceUri: string): Promise<string> {
  const resized = await ImageManipulator.manipulateAsync(
    sourceUri,
    [{resize: {width: AVATAR_SIZE_PX}}],
    {compress: AVATAR_QUALITY, format: ImageManipulator.SaveFormat.JPEG},
  );

  const dir = new Directory(Paths.document, AVATAR_DIR);
  if (!dir.exists) {
    dir.create({intermediates: true, idempotent: true});
  }
  const target = new File(dir, `${AVATAR_PREFIX}${Date.now()}.jpg`);
  await new File(resized.uri).copy(target);

  try {
    dir
      .list()
      .filter(
        (f): f is File => f instanceof File && f.name.startsWith(AVATAR_PREFIX),
      )
      .sort((a, b) => (a.name < b.name ? 1 : -1))
      .slice(KEEP_RECENT)
      .forEach(f => f.delete());
  } catch {
    // Pruning is best effort.
  }
  return target.uri;
}

export async function pickAvatar(
  source: AvatarSource,
): Promise<AvatarPickResult> {
  let pickedUri: string;

  if (source === 'files') {
    const result = await DocumentPicker.getDocumentAsync({
      type: 'image/*',
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (result.canceled || !result.assets?.[0]) {
      return {status: 'cancelled'};
    }
    pickedUri = result.assets[0].uri;
  } else {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      return {status: 'denied', canAskAgain: permission.canAskAgain};
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.[0]) {
      return {status: 'cancelled'};
    }
    pickedUri = result.assets[0].uri;
  }

  return {status: 'selected', uri: await persistAvatar(pickedUri)};
}
