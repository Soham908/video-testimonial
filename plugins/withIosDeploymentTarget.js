const { createRunOncePlugin, withPodfile } = require('@expo/config-plugins');

const MARKER = '# @generated withIosDeploymentTarget';

function withIosDeploymentTarget(config) {
  return withPodfile(config, (mod) => {
    if (mod.modResults.contents.includes(MARKER)) return mod;

    const hook = '  post_install do |installer|';
    if (!mod.modResults.contents.includes(hook)) {
      throw new Error('withIosDeploymentTarget: expected Podfile post_install hook was not found.');
    }

    // Include resource bundles, which can retain unsupported iOS 9-12 targets.
    // React Native's subsequent hook preserves any higher deployment target.
    const deploymentFloor = `
    ${MARKER}
    minimum_ios_version = Gem::Version.new('16.4')
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |build_configuration|
        deployment_target = build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET']
        if deployment_target.nil? || Gem::Version.new(deployment_target) < minimum_ios_version
          build_configuration.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = minimum_ios_version.to_s
        end
      end
    end
`;
    mod.modResults.contents = mod.modResults.contents.replace(hook, `${hook}\n${deploymentFloor}`);
    return mod;
  });
}

module.exports = createRunOncePlugin(withIosDeploymentTarget, 'withIosDeploymentTarget', '1.0.0');
