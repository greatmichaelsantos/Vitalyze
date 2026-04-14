const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Firebase v10+ ships with a package `exports` map that includes a
// `react-native` condition pointing to the React-Native-specific build of
// @firebase/auth (dist/rn/index.js).  Without these two settings Metro
// ignores the exports map entirely and falls back to the browser build,
// which is missing the React Native component registrations and causes the
// "Component auth has not been registered yet" error in Expo Go.
config.resolver.unstable_enablePackageExports = true;
config.resolver.unstable_conditionNames = [
  'react-native',
  'require',
  'default',
];

module.exports = config;
