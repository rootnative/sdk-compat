const path = require('node:path')
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config')

// Two imports of the demo screens that an app with no Expo can't install.
// `@rootnative/utils` isn't on npm, so the workflow copies its source into
// `vendor/utils`. `expo-router` gets a stand-in.
const alias = {
  '@rootnative/utils': path.join(__dirname, 'vendor/utils/index.ts'),
  'expo-router': path.join(__dirname, 'src/expo-router.ts'),
}

module.exports = mergeConfig(getDefaultConfig(__dirname), {
  resolver: {
    resolveRequest: (context, moduleName, platform) =>
      alias[moduleName]
        ? { type: 'sourceFile', filePath: alias[moduleName] }
        : context.resolveRequest(context, moduleName, platform),
  },
})
