import {useCallback, useRef, useState} from 'react';
import {Alert, Linking} from 'react-native';

import {
  pickReceiptImage,
  ReceiptImageSource,
} from '../../lib/receipts/scanReceipt';
import {ReceiptImage} from './ReceiptReviewScreen';

/**
 * The "Scan receipt" entry from the + menu: asks camera or photos, picks the
 * image, and holds it while ReceiptReviewScreen reads and reviews it.
 */
export function useReceiptScanner() {
  const [image, setImage] = useState<ReceiptImage | null>(null);
  const picking = useRef(false);

  const scanFrom = useCallback(async (source: ReceiptImageSource) => {
    if (picking.current) {
      return;
    }
    picking.current = true;
    try {
      const result = await pickReceiptImage(source);
      if (result.status === 'selected') {
        setImage({uri: result.uri, width: result.width});
      } else if (result.status === 'denied') {
        const what = source === 'camera' ? 'camera' : 'photos';
        Alert.alert(
          `Allow ${what} access`,
          `Paisa needs ${what} access to scan a receipt. You can turn it on in Settings.`,
          [
            {text: 'Not now', style: 'cancel'},
            {text: 'Open Settings', onPress: () => Linking.openSettings()},
          ],
        );
      }
    } catch {
      Alert.alert(
        'Could not open the photo',
        'Something went wrong while loading that image. Try another one.',
      );
    } finally {
      picking.current = false;
    }
  }, []);

  const start = useCallback(() => {
    Alert.alert(
      'Scan a receipt',
      'Take a photo of the receipt or pick one you already have.',
      [
        {text: 'Take photo', onPress: () => scanFrom('camera')},
        {text: 'Choose photo', onPress: () => scanFrom('library')},
        {text: 'Cancel', style: 'cancel'},
      ],
    );
  }, [scanFrom]);

  const clear = useCallback(() => setImage(null), []);

  return {image, start, clear};
}
