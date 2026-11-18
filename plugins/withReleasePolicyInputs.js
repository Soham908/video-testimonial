const {withAppBuildGradle,createRunOncePlugin}=require('@expo/config-plugins');
const START='// @generated Insight Scoop policy bundle inputs';
const END='// @end Insight Scoop policy bundle inputs';
function applyPolicyInputs(contents){
 const start=contents.indexOf(START);
 if(start!==-1){const end=contents.indexOf(END,start);if(end===-1)throw new Error('Incomplete policy input marker');contents=contents.slice(0,start)+contents.slice(end+END.length);}
 return contents.trimEnd()+`\n${START}
// React Native's default JS input glob can omit imported JSON. Policy-only
// edits must invalidate the release bundle, not silently ship cached wording.
tasks.configureEach { task ->
    if (task.name.startsWith('createBundle') && task.name.endsWith('JsAndAssets')) {
        task.inputs.files(
            new File(rootDir, '../release/insight-scoop/config.json'),
            new File(rootDir, '../release/insight-scoop/content/policies.json')
        ).withPropertyName('insightScoopPolicySources').withPathSensitivity(org.gradle.api.tasks.PathSensitivity.RELATIVE)
    }
}
${END}\n`;
}
module.exports=createRunOncePlugin(config=>withAppBuildGradle(config,mod=>{if(mod.modResults.language!=='groovy')throw Error('Groovy build.gradle expected');mod.modResults.contents=applyPolicyInputs(mod.modResults.contents);return mod;}),'withReleasePolicyInputs','1.0.0');
module.exports.applyPolicyInputs=applyPolicyInputs;
