const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const FEATURE_FLAGS_SUBPATH =
  'react-native/src/private/featureflags/ReactNativeFeatureFlags';
const FEATURE_FLAGS_FILE = path.join(
  path.dirname(require.resolve('react-native/package.json')),
  'src/private/featureflags/ReactNativeFeatureFlags.js',
);

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * RN 0.87 dropped `./src/*` from package exports, but
 * `@react-native/virtualized-lists` still deep-imports feature flags.
 * Resolve that path directly until an upstream patch lands.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  resolver: {
    resolveRequest: (context, moduleName, platform) => {
      if (moduleName === FEATURE_FLAGS_SUBPATH) {
        return {
          type: 'sourceFile',
          filePath: FEATURE_FLAGS_FILE,
        };
      }

      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
