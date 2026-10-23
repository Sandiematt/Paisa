jest.mock('expo', () => ({
  registerRootComponent: component => component,
}));

jest.mock('expo-dev-client', () => ({}));

jest.mock('react-native-url-polyfill/auto', () => ({}));

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
