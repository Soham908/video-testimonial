module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // react-native-worklets/plugin must be listed LAST. Required by
    // react-native-vision-camera-worklets (Frame Processors). Successor to
    // the old react-native-reanimated/plugin.
    plugins: ['react-native-worklets/plugin'],
  };
};
