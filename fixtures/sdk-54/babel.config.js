module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    // The worklets plugin MUST be the last entry. Inertia's runtime
    // installCheck reports a missing __workletHash when it is absent.
    plugins: ['react-native-worklets/plugin'],
  }
}
