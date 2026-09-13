const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

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
 * https://reactnative.dev/docs/metro
 *
 * RN 0.87 dropped `./src/*` from package exports, but
 * `@react-native/virtualized-lists` still deep-imports feature flags.
 * Resolve that path directly until an upstream patch lands.
 *
 * Tamagui nests many copies of `@tamagui/web`. Force those singletons to one
 * folder so TamaguiProvider and styled views share the same config.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const defaultMetro = getDefaultConfig(__dirname);

const config = {
  resolver: {
    sourceExts: [...defaultMetro.resolver.sourceExts, 'css'],
    resolveRequest: (context, moduleName, platform) => {
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

      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
