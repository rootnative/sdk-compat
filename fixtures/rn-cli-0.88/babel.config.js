module.exports = {
  presets: ['module:@react-native/babel-preset'],
  // The worklets plugin must be the last entry. The React Native preset
  // doesn't add it, as babel-preset-expo does, so a CLI app adds it by hand.
  plugins: ['react-native-worklets/plugin'],
}
