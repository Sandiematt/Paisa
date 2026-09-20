const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const FEATURE_FLAGS_SUBPATH =
  'react-native/src/private/featureflags/ReactNativeFeatureFlags';
const FEATURE_FLAGS_FILE = path.join(
  path.dirname(require.resolve('react-native/package.json')),
  'src/private/featureflags/ReactNativeFeatureFlags.js',
);

/**
 * Metro configuration
 * https://docs.expo.dev/guides/customizing-metro/
 *
 * RN 0.87 dropped `./src/*` from package exports, but
 * `@react-native/virtualized-lists` still deep-imports feature flags.
 * Resolve that path directly until an upstream patch lands.
 *
 * @type {import('expo/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === FEATURE_FLAGS_SUBPATH) {
    return {
      type: 'sourceFile',
      filePath: FEATURE_FLAGS_FILE,
    };
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
