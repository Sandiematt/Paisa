jest.mock('react-native-url-polyfill/auto', () => ({}));

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
