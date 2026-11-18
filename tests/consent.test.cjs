const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function load(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const module = {exports:{}};
  new Function('require','module','exports',source)(id => {if(id in mocks)return mocks[id];throw new Error(`Unexpected import: ${id}`);},module,module.exports);
  return module.exports;
}
function storage(initial, failWrite=false) {
  let content=initial;
  class File {
    get exists(){return content!==undefined;}
    create(){content='';}
    textSync(){return content;}
    write(next){if(failWrite)throw new Error('disk unavailable');content=next;}
  }
  const api=load('consent.ts',{'expo-file-system':{File,Paths:{document:'private-test-dir'}},'./legalDocuments':{POLICY_VERSION:'current-version'}});
  return {api, read:()=>content};
}
test('legacy consent does not authorize newly disclosed external processing',()=>{
  for(const initial of [undefined,'broken json','["alice"]','[{"distributorId":"alice","version":"old-version","acceptedAt":"2026-01-01T00:00:00Z"}]']){
    assert.equal(storage(initial).api.hasConsented('alice'),false);
  }
});
test('consent is scoped to account and version; renewal preserves other accounts',()=>{
  const f=storage();f.api.markConsented('alice');assert.equal(f.api.hasConsented('alice'),true);assert.equal(f.api.hasConsented('bob'),false);
  f.api.markConsented('bob');f.api.markConsented('alice');
  const data=JSON.parse(f.read());assert.equal(data.length,2);assert.equal(data.find(x=>x.distributorId==='alice').version,'current-version');
  assert.ok(Number.isFinite(Date.parse(data[0].acceptedAt)));assert.equal(f.api.hasConsented('bob'),true);
});
test('malformed records and failed persistence never grant consent',()=>{
  const malformed=storage('[null,17,{"distributorId":"alice","version":"current-version","acceptedAt":"invalid"}]');assert.equal(malformed.api.hasConsented('alice'),false);
  const failing=storage(undefined,true);assert.throws(()=>failing.api.markConsented('alice'));assert.equal(failing.api.hasConsented('alice'),false);
  assert.throws(()=>storage().api.markConsented(' '));
});
function screenFixture(onAgree=()=>{}) {
  let cursor=0;const states=[];let accepted=0,declined=0;
  const react={useMemo:fn=>fn(),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],next=>{states[i]=typeof next==='function'?next(states[i]):next;}];}};
  const jsx=(type,props)=>({type,props:props||{}});
  const component=load('screens/ConsentScreen.tsx',{
    react,'react/jsx-runtime':{jsx,jsxs:jsx},'react-native':{Pressable:'Pressable',ScrollView:'ScrollView',Text:'Text',View:'View',StyleSheet:{create:x=>x}},
    'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:24,bottom:24,left:0,right:0})},
    '../theme/ThemeContext':{useTheme:()=>({colors:{},spacing:{},radius:{},typography:{}})},'../i18n/useStrings':{useStrings:()=>({t:key=>key})},
    '../components/ui/Button':{Button:'Button'},'../components/LegalDocumentViewer':{LegalDocumentViewer:'LegalDocumentViewer'}
  }).ConsentScreen;
  function render(){cursor=0;return component({onAgree(){onAgree();accepted++;},onDecline(){declined++;}});}
  function all(node,predicate){if(!node||typeof node!=='object')return[];return [...(predicate(node)?[node]:[]),...[node.props?.children].flat(Infinity).flatMap(x=>all(x,predicate))];}
  return {render,all,accepted:()=>accepted,declined:()=>declined};
}
test('reading full policies never checks consent; both explicit choices are required',()=>{
  const f=screenFixture();let tree=f.render();assert.equal(f.all(tree,n=>n.type==='Button')[0].props.disabled,true);
  f.all(tree,n=>n.props.accessibilityRole==='link')[0].props.onPress();tree=f.render();
  assert.equal(f.all(tree,n=>n.type==='LegalDocumentViewer')[0].props.document,'privacy');
  assert.equal(f.all(tree,n=>n.type==='Button')[0].props.disabled,true);
  f.all(tree,n=>n.props.accessibilityRole==='checkbox')[0].props.onPress();tree=f.render();assert.equal(f.all(tree,n=>n.type==='Button')[0].props.disabled,true);
  f.all(tree,n=>n.props.accessibilityRole==='checkbox')[1].props.onPress();tree=f.render();const button=f.all(tree,n=>n.type==='Button')[0];assert.equal(button.props.disabled,false);button.props.onPress();assert.equal(f.accepted(),1);
});
test('failed consent write is visible and declining never accepts',()=>{
  const f=screenFixture(()=>{throw new Error('disk full');});let tree=f.render();f.all(tree,n=>n.type==='Button')[0].props.onPress();tree=f.render();
  assert.equal(f.accepted(),0);assert.equal(f.all(tree,n=>n.props.accessibilityRole==='alert').length,1);
  const decline=f.all(tree,n=>n.props.accessibilityRole==='button')[0];decline.props.onPress();assert.equal(f.declined(),1);assert.equal(f.accepted(),0);
});
