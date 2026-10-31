jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('expo-local-authentication', () => ({
  AuthenticationType: {FINGERPRINT: 1, FACIAL_RECOGNITION: 2, IRIS: 3},
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  supportedAuthenticationTypesAsync: jest.fn(),
}));

import * as LocalAuthentication from 'expo-local-authentication';

import {biometricSupport} from '../src/lib/biometricLock';

const types = LocalAuthentication.supportedAuthenticationTypesAsync as jest.Mock;

describe('biometricSupport label', () => {
  it('says fingerprint when the phone also lists face unlock', async () => {
    types.mockResolvedValueOnce([2, 1]);
    expect(await biometricSupport()).toEqual({available: true, label: 'Fingerprint'});
  });

  it('says face unlock when that is all the phone has', async () => {
    types.mockResolvedValueOnce([2]);
    expect(await biometricSupport()).toEqual({available: true, label: 'Face unlock'});
  });
});
