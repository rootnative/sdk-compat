// The Babel config of the device app. A CLI app adds the worklets plugin by
// hand, as the last plugin: the React Native preset doesn't add it.
module.exports = {
  presets: ['module:@react-native/babel-preset'],
  plugins: ['react-native-worklets/plugin'],
}
