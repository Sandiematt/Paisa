import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const prefKey = (userId: string) => `sikka.biometricLock.${userId}`;

export type BiometricSupport =
  | {available: true; label: string}
  | {available: false; reason: string};

export async function loadBiometricPref(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(prefKey(userId))) === '1';
  } catch {
    return false;
  }
}

export async function saveBiometricPref(
  userId: string,
  enabled: boolean,
): Promise<void> {
  if (enabled) {
    await AsyncStorage.setItem(prefKey(userId), '1');
  } else {
    await AsyncStorage.removeItem(prefKey(userId));
  }
}

export async function clearBiometricPref(userId: string): Promise<void> {
  await AsyncStorage.removeItem(prefKey(userId));
}

export async function biometricSupport(): Promise<BiometricSupport> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) {
    return {
      available: false,
      reason: 'This device has no fingerprint or face sensor.',
    };
  }
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  if (!enrolled) {
    return {
      available: false,
      reason:
        'Add a fingerprint or face in your device settings, then turn this on.',
    };
  }
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  const label = types.includes(
    LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION,
  )
    ? 'Face unlock'
    : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
      ? 'Fingerprint'
      : 'Biometrics';
  return {available: true, label};
}

export async function authenticate(promptMessage: string): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
  });
  return result.success;
}
