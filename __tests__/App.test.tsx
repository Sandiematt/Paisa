/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

jest.mock('../src/theme/useAppFonts', () => ({useAppFonts: () => true}));
// Native Expo modules the full app tree imports; jest has no native side.
jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: () => ({type: 'failed'}),
  openAuthSessionAsync: async () => ({type: 'cancel'}),
}));
jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync: async () => false,
  isEnrolledAsync: async () => false,
  authenticateAsync: async () => ({success: false}),
}));
jest.mock('expo-sharing', () => ({
  isAvailableAsync: async () => false,
  shareAsync: async () => {},
}));
jest.mock('expo-file-system', () => ({
  File: class {},
  Directory: class {},
  Paths: {cache: '', document: ''},
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
