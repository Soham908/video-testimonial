const { createRunOncePlugin, withAppBuildGradle } = require('@expo/config-plugins');

const START = '// @generated Insight Scoop release signing';
const END = '// @end Insight Scoop release signing';
const signing = `
${START}
// This file contains no secret values. Load owner-only credentials outside Git.
def insightSigningPath = System.getenv('INSIGHT_ANDROID_SIGNING_PROPERTIES') ?: new File(System.getProperty('user.home'), '.config/insight-scoop/signing/android-signing.properties').absolutePath
def insightSigningFile = new File(insightSigningPath)
def insightSigning = new java.util.Properties()
def insightSigningReady = insightSigningFile.isFile()
if (insightSigningReady) {
    def permissions = java.nio.file.Files.getPosixFilePermissions(insightSigningFile.toPath())
    if (permissions.any { it.name().startsWith('GROUP_') || it.name().startsWith('OTHERS_') }) {
        throw new GradleException('Insight Scoop signing properties must be owner-only (chmod 600).')
    }
    insightSigningFile.withInputStream { insightSigning.load(it) }
    if (['storeFile', 'storeType', 'keyAlias', 'storePassword', 'keyPassword'].any { !insightSigning.getProperty(it) }) {
        throw new GradleException('Insight Scoop private signing configuration is incomplete.')
    }
    if (insightSigning.keyAlias == 'androiddebugkey' || new File(insightSigning.storeFile).name == 'debug.keystore') {
        throw new GradleException('A debug keystore cannot sign an Insight Scoop release.')
    }
    android.signingConfigs.maybeCreate('insightScoopUpload').with {
        storeFile = new File(insightSigning.getProperty('storeFile'))
        storeType = insightSigning.getProperty('storeType')
        keyAlias = insightSigning.getProperty('keyAlias')
        storePassword = insightSigning.getProperty('storePassword')
        keyPassword = insightSigning.getProperty('keyPassword')
    }
    android.buildTypes.release.signingConfig = android.signingConfigs.insightScoopUpload
} else {
    android.buildTypes.release.signingConfig = null
}
// Guard the actual release build graph, including abbreviated task invocations.
// Debug builds remain usable without distribution credentials.
tasks.configureEach { task ->
    if (task.name ==~ /pre.*ReleaseBuild/) {
        task.doFirst {
            if (!insightSigningReady || !new File(insightSigning.getProperty('storeFile')).isFile()) {
                throw new GradleException('Insight Scoop release signing credentials are missing. See the private signing setup; debug signing is never a release fallback.')
            }
        }
    }
}
${END}
`;

function applyReleaseSigning(contents) {
  const existing = contents.indexOf(START);
  if (existing !== -1) {
    const end = contents.indexOf(END, existing);
    if (end === -1) throw new Error('Incomplete Insight Scoop signing marker');
    contents = contents.slice(0, existing) + contents.slice(end + END.length);
  }
  // Remove only the Expo template's RELEASE debug fallback; preserve debug builds.
  const release = /(\brelease\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
  if (release.test(contents)) {
    contents = contents.replace(release, '$1signingConfig null // Configured by withAndroidReleaseSigning below');
  } else if (!contents.includes('signingConfig null // Configured by withAndroidReleaseSigning below')) {
    throw new Error('Expected Expo Groovy release signing configuration was not found');
  }
  return contents.trimEnd() + '\n' + signing;
}

function withAndroidReleaseSigning(config) {
  return withAppBuildGradle(config, mod => {
    if (mod.modResults.language !== 'groovy') throw new Error('Insight Scoop release signing requires Groovy build.gradle');
    mod.modResults.contents = applyReleaseSigning(mod.modResults.contents);
    return mod;
  });
}
module.exports = createRunOncePlugin(withAndroidReleaseSigning, 'withAndroidReleaseSigning', '1.0.0');
module.exports.applyReleaseSigning = applyReleaseSigning;
