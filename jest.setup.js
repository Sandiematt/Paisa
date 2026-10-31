/* eslint-env jest */
jest.mock('expo', () => ({
  registerRootComponent: component => component,
}));

jest.mock('expo-dev-client', () => ({}));

jest.mock('react-native-url-polyfill/auto', () => ({}));

jest.mock('lottie-react-native', () => {
  const {View} = require('react-native');
  return {__esModule: true, default: View};
});

jest.mock('expo-notifications', () => ({
  AndroidImportance: {DEFAULT: 3, HIGH: 4},
  SchedulableTriggerInputTypes: {DATE: 'date'},
  DEFAULT_ACTION_IDENTIFIER: 'expo.modules.notifications.actions.DEFAULT',
  setNotificationHandler: () => {},
  setNotificationChannelAsync: async () => null,
  getPermissionsAsync: async () => ({
    granted: false,
    status: 'undetermined',
    canAskAgain: true,
  }),
  requestPermissionsAsync: async () => ({
    granted: false,
    status: 'denied',
    canAskAgain: false,
  }),
  scheduleNotificationAsync: async () => 'id',
  getAllScheduledNotificationsAsync: async () => [],
  cancelScheduledNotificationAsync: async () => {},
  getPresentedNotificationsAsync: async () => [],
  getLastNotificationResponseAsync: async () => null,
  addNotificationReceivedListener: () => ({remove: () => {}}),
  addNotificationResponseReceivedListener: () => ({remove: () => {}}),
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  return {
    __esModule: true,
    default: {
      getItem: async key => store.get(key) ?? null,
      setItem: async (key, value) => {
        store.set(key, value);
      },
      removeItem: async key => {
        store.delete(key);
      },
      clear: async () => {
        store.clear();
      },
    },
  };
});

jest.mock('./src/lib/supabase/client', () => ({
  supabase: {
    auth: {
      getSession: async () => ({data: {session: null}}),
      onAuthStateChange: () => ({
        data: {subscription: {unsubscribe: () => {}}},
      }),
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
  },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: async () => ({granted: false, canAskAgain: false}),
  requestMediaLibraryPermissionsAsync: async () => ({granted: false, canAskAgain: false}),
  launchCameraAsync: async () => ({canceled: true, assets: null}),
  launchImageLibraryAsync: async () => ({canceled: true, assets: null}),
}));

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: async () => ({canceled: true, assets: null}),
}));

jest.mock('expo-image-manipulator', () => ({
  manipulateAsync: async uri => ({uri, width: 512, height: 512}),
  SaveFormat: {JPEG: 'jpeg', PNG: 'png'},
}));

// The native UPI detector exists only in the Android build. Platform.OS is
// 'ios' under jest, so the JS wrapper treats it as unsupported unless a test
// switches the platform to 'android'; then it reaches these stubs, which
// resolve the same empty values the real module would for a fresh install.
const {NativeModules} = require('react-native');
NativeModules.UpiDetector = {
  getStatus: jest.fn(async () =>
    JSON.stringify({
      accessibilityEnabled: false,
      notificationAccessEnabled: false,
      installedApps: [],
      trackingMethod: 'accessibility',
      shizukuState: 'not_installed',
      shizukuCaptureRunning: false,
    }),
  ),
  openAccessibilitySettings: jest.fn(async () => {}),
  openNotificationAccessSettings: jest.fn(async () => {}),
  getTransactions: jest.fn(async () => '[]'),
  getLog: jest.fn(async () => '[]'),
  getPending: jest.fn(async () => '[]'),
  ackSynced: jest.fn(async () => {}),
  setPreferences: jest.fn(async () => {}),
  getPreferences: jest.fn(async () =>
    JSON.stringify({notesEnabled: true, blockingEnabled: true}),
  ),
  setBudgetSnapshot: jest.fn(async () => {}),
  getAllowance: jest.fn(async () => null),
  keep: jest.fn(async () => {}),
  merge: jest.fn(async () => {}),
  clear: jest.fn(async () => {}),
  buildReport: jest.fn(async () => ''),
  setOwner: jest.fn(async () => {}),
  clearUserData: jest.fn(async () => {}),
  setLogStreaming: jest.fn(async () => {}),
  setTrackingMethod: jest.fn(async method => method),
  requestShizukuPermission: jest.fn(async () => true),
  openShizuku: jest.fn(async () => {}),
  startShizukuCapture: jest.fn(async () => true),
  stopShizukuCapture: jest.fn(async () => {}),
  addListener: jest.fn(),
  removeListeners: jest.fn(),
};
