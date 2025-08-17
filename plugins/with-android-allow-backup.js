const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withAndroidAllowBackup(config) {
  return withAndroidManifest(config, (config) => {
    const app = config.modResults.manifest.application?.[0];
    if (app) {
      // فقط بکاپ را ببندیم؛ debuggable را اصلاً ست نکنیم
      app.$['android:allowBackup'] = 'false';
    }
    return config;
  });
};
