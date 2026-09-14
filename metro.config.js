const path = require('path');
const {getDefaultConfig} = require('expo/metro-config');

const FEATURE_FLAGS_SUBPATH =
  'react-native/src/private/featureflags/ReactNativeFeatureFlags';
const FEATURE_FLAGS_FILE = path.join(
  path.dirname(require.resolve('react-native/package.json')),
  'src/private/featureflags/ReactNativeFeatureFlags.js',
);

const TAMAGUI_CORE_DIR = path.dirname(
  require.resolve('@tamagui/core/package.json'),
);
const TAMAGUI_WEB_DIR = path.join(
  TAMAGUI_CORE_DIR,
  'node_modules',
  '@tamagui',
  'web',
);
const TAMAGUI_CORE_ORIGIN = path.join(TAMAGUI_CORE_DIR, 'package.json');
const TAMAGUI_WEB_ORIGIN = path.join(TAMAGUI_WEB_DIR, 'package.json');

/**
 * Metro configuration
 * https://docs.expo.dev/guides/customizing-metro/
 *
 * RN 0.87 dropped `./src/*` from package exports, but
 * `@react-native/virtualized-lists` still deep-imports feature flags.
 * Resolve that path directly until an upstream patch lands.
 *
 * Tamagui nests many copies of `@tamagui/web`. Force those singletons to one
 * folder so TamaguiProvider and styled views share the same config.
 *
 * @type {import('expo/metro-config').MetroConfig}
 */
const config = getDefaultConfig(__dirname);
const defaultResolveRequest = config.resolver.resolveRequest;

if (!config.resolver.sourceExts.includes('css')) {
  config.resolver.sourceExts = [...config.resolver.sourceExts, 'css'];
}

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === FEATURE_FLAGS_SUBPATH) {
    return {
      type: 'sourceFile',
      filePath: FEATURE_FLAGS_FILE,
    };
  }

  if (
    moduleName === '@tamagui/web' ||
    moduleName.startsWith('@tamagui/web/')
  ) {
    return context.resolveRequest(
      {
        ...context,
        originModulePath: TAMAGUI_WEB_ORIGIN,
        resolveRequest: undefined,
      },
      moduleName,
      platform,
    );
  }

  if (
    moduleName === '@tamagui/core' ||
    moduleName.startsWith('@tamagui/core/')
  ) {
    return context.resolveRequest(
      {
        ...context,
        originModulePath: TAMAGUI_CORE_ORIGIN,
        resolveRequest: undefined,
      },
      moduleName,
      platform,
    );
  }

  if (defaultResolveRequest) {
    return defaultResolveRequest(context, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
