import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import {supabase} from '../supabase/client';
import {dataErrorMessage} from '../supabase/errors';

export type ReceiptImageSource = 'camera' | 'library';

export type ReceiptPickResult =
  | {status: 'selected'; uri: string; width: number}
  | {status: 'cancelled'}
  | {status: 'denied'; canAskAgain: boolean};

/** Wide enough for small print to stay legible, small enough to upload fast. */
export const RECEIPT_MAX_WIDTH_PX = 1600;
const RECEIPT_QUALITY = 0.75;

export async function pickReceiptImage(
  source: ReceiptImageSource,
): Promise<ReceiptPickResult> {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    return {status: 'denied', canAskAgain: permission.canAskAgain};
  }
  // Free cropping lets the user trim the table or background off a long receipt.
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: true,
    quality: 1,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  const asset = result.canceled ? null : result.assets?.[0];
  if (!asset) {
    return {status: 'cancelled'};
  }
  return {status: 'selected', uri: asset.uri, width: asset.width ?? 0};
}

/** The function's `{error}` body, when the failure came with one. */
async function functionErrorMessage(error: unknown): Promise<string | null> {
  const context = (error as {context?: {json?: () => Promise<unknown>}})
    ?.context;
  if (!context || typeof context.json !== 'function') {
    return null;
  }
  try {
    const body = (await context.json()) as {error?: unknown};
    return typeof body?.error === 'string' ? body.error : null;
  } catch {
    return null;
  }
}

/**
 * OCR: sends a downsized JPEG of the receipt to the `scan-receipt` Edge
 * Function and returns the printed lines, top to bottom. Nothing is stored.
 */
export async function recognizeReceiptText(
  uri: string,
  width = 0,
): Promise<string[]> {
  const resized = await ImageManipulator.manipulateAsync(
    uri,
    width === 0 || width > RECEIPT_MAX_WIDTH_PX
      ? [{resize: {width: RECEIPT_MAX_WIDTH_PX}}]
      : [],
    {
      compress: RECEIPT_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  if (!resized.base64) {
    throw new Error('Could not prepare the photo. Try another one.');
  }

  const {data, error} = await supabase.functions.invoke<{lines: string[]}>(
    'scan-receipt',
    {body: {image: resized.base64, mimeType: 'image/jpeg'}},
  );
  if (error || !data) {
    throw new Error(
      (await functionErrorMessage(error)) ?? dataErrorMessage(error),
    );
  }
  return Array.isArray(data.lines)
    ? data.lines.filter((line): line is string => typeof line === 'string')
    : [];
}
