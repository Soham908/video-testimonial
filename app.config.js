// Staging installs alongside the store app and never reuses its account/files.
// The default configuration remains app.json's production configuration.
const STAGING_API = 'https://insight-backend.thezeist.com/staging';
module.exports = ({ config }) => {
  const variant = process.env.INSIGHT_APP_VARIANT || 'production';
  if (!['production', 'staging'].includes(variant)) throw new Error('Unknown INSIGHT_APP_VARIANT');
  if (variant === 'production') {
    if (process.env.EXPO_PUBLIC_API_BASE_URL === STAGING_API) {
      throw new Error('The staging API requires the staging app variant');
    }
    return config;
  }
  if (process.env.EXPO_PUBLIC_API_BASE_URL !== STAGING_API) {
    throw new Error('Staging builds require the dedicated staging API URL');
  }
  return {
    ...config,
    name: 'Insight Scoop Staging',
    slug: 'insight-scoop-staging',
    scheme: 'insightscoop-staging',
    version: '1.1.0',
    ios: { ...config.ios, bundleIdentifier: 'com.zeistinteractive.insightscoop.staging', buildNumber: '5' },
    android: { ...config.android, package: 'com.zeistinteractive.insightscoop.staging', versionCode: 5 },
  };
};
