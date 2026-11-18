const { withAndroidManifest, createRunOncePlugin } = require('@expo/config-plugins');
function applyPrivacy(manifest) {
 const app=manifest.manifest.application[0];
 manifest.manifest.$['xmlns:tools']='http://schemas.android.com/tools';
 for(const permission of manifest.manifest['uses-permission'] || []) {
  if(permission.$['android:name']==='android.permission.WRITE_EXTERNAL_STORAGE') {permission.$['android:maxSdkVersion']='28';permission.$['tools:replace']='android:maxSdkVersion';}
 }
 app.$['android:allowBackup']='false';
 app.$['android:usesCleartextTraffic']='false';
 // Scoped MediaStore save-only export works without legacy gallery access.
 app.$['android:requestLegacyExternalStorage']='false';
 return manifest;
}
module.exports=createRunOncePlugin(config => withAndroidManifest(config, mod => {mod.modResults=applyPrivacy(mod.modResults);return mod;}),'withAndroidPrivacy','1.0.0');
module.exports.applyPrivacy=applyPrivacy;
