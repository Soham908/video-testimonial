const { AndroidConfig, withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');

// react-native-background-actions ships its own bundled
// <service android:name=".RNBackgroundActionsTask"/> (no
// foregroundServiceType, no type-specific permission - checked in
// node_modules/react-native-background-actions/android/src/main/AndroidManifest.xml).
// That's merged into the final manifest by Gradle at actual build time, not
// at `expo prebuild` time, so re-declaring the same component here (fully-
// qualified, since this app-level manifest's own `package` isn't the
// library's) with the added attribute is a safe merge, not a duplicate.
//
// This has to be a config plugin, not a hand-edited AndroidManifest.xml -
// /android is gitignored and regenerated via `expo prebuild`
// (DEV_NOTES.md's "any manual native-file edit is silently lost on
// `expo prebuild --clean`" gotcha), so a one-off manifest edit would vanish
// on the next clean prebuild.
const SERVICE_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

// 'dataSync' is the correct type for "uploading files in the background" -
// must stay in sync with the same string passed as `foregroundServiceType`
// in AppFlow.tsx's BackgroundService.start() call (the upload keep-alive
// wrapper). Mandatory to declare on Android 14/API 34+, per
// react-native-background-actions' own INSTALL.md - an app targeting API 34
// that starts a foreground service without a matching manifest declaration
// gets a MissingForegroundServiceTypeException at runtime, not a silent
// no-op.
const SERVICE_TYPE = 'dataSync';

function withBackgroundUploadService(config) {
  // FOREGROUND_SERVICE itself is already contributed by the library's own
  // manifest merge (same file referenced above) - only the type-specific
  // permission and WAKE_LOCK (per INSTALL.md's own base-permission list)
  // need adding here.
  config = AndroidConfig.Permissions.withPermissions(config, [
    'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    'android.permission.WAKE_LOCK',
  ]);

  return withAndroidManifest(config, (config) => {
    const mainApplication = AndroidConfig.Manifest.getMainApplicationOrThrow(config.modResults);
    mainApplication.service = mainApplication.service ?? [];

    const existing = mainApplication.service.find((s) => s.$['android:name'] === SERVICE_NAME);
    if (existing) {
      existing.$['android:foregroundServiceType'] = SERVICE_TYPE;
    } else {
      mainApplication.service.push({
        $: {
          'android:name': SERVICE_NAME,
          'android:foregroundServiceType': SERVICE_TYPE,
        },
      });
    }

    return config;
  });
}

module.exports = createRunOncePlugin(withBackgroundUploadService, 'withBackgroundUploadService', '1.0.0');
