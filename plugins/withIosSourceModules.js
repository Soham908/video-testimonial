const { createRunOncePlugin, withPodfileProperties } = require('@expo/config-plugins');

function withIosSourceModules(config) {
  return withPodfileProperties(config, (mod) => {
    // Compile Expo modules together to avoid incompatible prebuilt Swift APIs.
    mod.modResults.EXPO_USE_PRECOMPILED_MODULES = 'false';
    return mod;
  });
}

module.exports = createRunOncePlugin(withIosSourceModules, 'withIosSourceModules', '1.0.0');
