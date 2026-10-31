import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

import {getRandomValues, sha256} from './webCrypto';

const prefKey = (userId: string) => `sikka.biometricLock.${userId}`;
const pinKey = (userId: string) => `sikka.appPin.${userId}`;

export const PIN_LENGTH = 4;

/** How the app locks: the phone's fingerprint or face, or a PIN only Paisa knows. */
export type LockMethod = 'biometric' | 'pin';

/** A PIN as stored: salted and hashed, never the digits themselves. */
export type PinRecord = {salt: string; hash: string};

// Repeated so a copied record costs more than one hash per guess. A 4-digit
// PIN is still only 10,000 guesses; it guards the screen, not the data.
const PIN_ROUNDS = 1000;

function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/** Bytes of an ASCII string; the salt is hex and the PIN is digits. */
function ascii(text: string): Uint8Array {
  return Uint8Array.from(text, char => char.charCodeAt(0) % 256);
}

export function hashPin(pin: string, salt: string): string {
  let digest = sha256(ascii(`${salt}:${pin}`));
  for (let round = 1; round < PIN_ROUNDS; round += 1) {
    digest = sha256(digest);
  }
  return toHex(digest);
}

export function makePinRecord(pin: string): PinRecord {
  const salt = toHex(getRandomValues(new Uint8Array(16)));
  return {salt, hash: hashPin(pin, salt)};
}

export function pinMatches(record: PinRecord, pin: string): boolean {
  return hashPin(pin, record.salt) === record.hash;
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function loadPinRecord(userId: string): Promise<PinRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(pinKey(userId));
    const parsed = raw ? (JSON.parse(raw) as PinRecord) : null;
    return parsed && typeof parsed.salt === 'string' && typeof parsed.hash === 'string'
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Saves the lock: a PIN record replaces the fingerprint choice, and the other way round. */
export async function saveLock(
  userId: string,
  lock: {method: 'biometric'} | {method: 'pin'; record: PinRecord} | null,
): Promise<void> {
  if (lock?.method === 'pin') {
    await AsyncStorage.setItem(pinKey(userId), JSON.stringify(lock.record));
    await AsyncStorage.removeItem(prefKey(userId));
    return;
  }
  await AsyncStorage.removeItem(pinKey(userId));
  await saveBiometricPref(userId, lock?.method === 'biometric');
}

export async function loadLockMethod(userId: string): Promise<LockMethod | null> {
  if (await loadPinRecord(userId)) {
    return 'pin';
  }
  return (await loadBiometricPref(userId)) ? 'biometric' : null;
}

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
  await AsyncStorage.removeItem(pinKey(userId));
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
  // Fingerprint first: Android phones with a fingerprint sensor often list
  // face unlock too, and the unlock prompt still asks for the fingerprint.
  const label = types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
    ? 'Fingerprint'
    : types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'Face unlock'
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
