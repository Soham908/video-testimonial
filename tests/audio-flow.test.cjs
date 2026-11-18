const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__DEV__', js)((id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected runtime dependency: ${id}`);
  }, module, module.exports, false);
  return module.exports;
}
const { AmbientNoiseSampler } = load('ambientNoise.ts');
const { playQuestionAudio } = load('playQuestionAudio.ts');
const flush = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function deferred() {
  let resolve; const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
function microphone() {
  const events = [], states = [];
  let now = 0;
  const recorder = {
    isRecording: false, uri: 'file:///noise-test.m4a', metering: -50,
    async prepareToRecordAsync() { events.push('prepare'); },
    record() { events.push('record'); this.isRecording = true; },
    async stop() { events.push('stop'); this.isRecording = false; },
    getStatus() { return { isRecording: this.isRecording, metering: this.metering }; },
  };
  const options = {
    requestPermission: async () => ({ granted: true }),
    configure: async () => { events.push('configure'); },
    deleteFile: () => events.push('delete'), onState: (state) => states.push(state), now: () => now,
  };
  return { recorder, events, states, options, advance: (ms) => { now += ms; } };
}
function playerFixture() {
  const listeners = new Set(), events = [];
  const player = {
    duration: 8, currentStatus: { isLoaded: true, error: null },
    addListener(event, callback) { assert.equal(event, 'playbackStatusUpdate'); listeners.add(callback); return { remove: () => listeners.delete(callback) }; },
    async seekTo(time) { assert.equal(time, 0); events.push('seek'); },
    play() { events.push('play'); }, pause() { events.push('pause'); },
    replace() { events.push('replace'); this.currentStatus = { isLoaded: true, error: null }; },
  };
  return { player, events, listeners, emit: (status) => {
    player.currentStatus = { ...player.currentStatus, ...status };
    for (const listener of [...listeners]) listener(player.currentStatus);
  }};
}

test('only a running recorder with finite readings can pass; warm-up starts at actual sampling', async () => {
  const f = microphone(); const sampler = new AmbientNoiseSampler(f.recorder, f.options);
  f.advance(2000); sampler.sample(); assert.deepEqual(f.states, []);
  await sampler.start();
  f.recorder.isRecording = false; sampler.sample(); f.advance(2000); sampler.sample();
  assert.deepEqual(f.states, []);
  f.recorder.isRecording = true; f.recorder.metering = NaN; sampler.sample();
  f.recorder.metering = -50; sampler.sample(); f.advance(999); sampler.sample();
  assert.deepEqual(f.states, []);
  f.advance(1); sampler.sample(); assert.equal(f.states.at(-1).status, 'good');
  f.recorder.metering = -10; sampler.sample(); assert.equal(f.states.at(-1).status, 'noisy');
  f.advance(2000); sampler.sample(); assert.equal(f.states.at(-1).sustainedNoisy, true);
  await sampler.stop(); assert.deepEqual(f.events.slice(-2), ['stop', 'delete']);
});

test('stop during slow native preparation waits and never starts an abandoned sampler', async () => {
  const f = microphone(), preparation = deferred();
  f.recorder.prepareToRecordAsync = () => { f.events.push('prepare'); return preparation.promise; };
  const sampler = new AmbientNoiseSampler(f.recorder, f.options);
  const starting = sampler.start(); await flush();
  const stopping = sampler.stop(); await flush();
  assert.deepEqual(f.events, ['configure', 'prepare']);
  preparation.resolve(); await Promise.all([starting, stopping]);
  assert.ok(!f.events.includes('record')); assert.ok(f.events.includes('delete'));
  assert.ok(f.events.includes('stop'), 'a prepared Android recorder must be released even before record()');
  await sampler.start(); assert.ok(f.events.includes('record')); await sampler.stop();
});

test('native stop must finish before another sampling run prepares', async () => {
  const f = microphone(), stopped = deferred();
  const sampler = new AmbientNoiseSampler(f.recorder, f.options); await sampler.start();
  f.recorder.stop = async () => { f.events.push('stop'); await stopped.promise; f.recorder.isRecording = false; };
  const stopping = sampler.stop(); const restarting = sampler.start(); await flush();
  assert.equal(f.events.filter((event) => event === 'prepare').length, 1);
  stopped.resolve(); await Promise.all([stopping, restarting]);
  assert.equal(f.events.filter((event) => event === 'prepare').length, 2);
  await sampler.stop();
});

test('failed or unavailable microphone is reported and a new attempt can recover', async () => {
  const f = microphone(); f.options.requestPermission = async () => ({ granted: false });
  const sampler = new AmbientNoiseSampler(f.recorder, f.options); await sampler.start();
  assert.equal(f.states.at(-1).status, 'unavailable'); assert.ok(!f.events.includes('record'));
  f.options.requestPermission = async () => ({ granted: true }); await sampler.start();
  assert.equal(f.states.at(-1).status, 'checking');
  sampler.sample(); f.advance(1000); sampler.sample(); assert.equal(f.states.at(-1).status, 'good');
  await sampler.stop();
});

test('no metering data times out as unavailable rather than good', async () => {
  const f = microphone(); const sampler = new AmbientNoiseSampler(f.recorder, f.options);
  await sampler.start(); f.recorder.metering = undefined; f.advance(10000); sampler.sample();
  assert.equal(f.states.at(-1).status, 'unavailable'); await sampler.stop();
});

test('long and delayed question audio waits for native completion and pauses before resolving', async () => {
  const f = playerFixture(); f.player.currentStatus.isLoaded = false;
  let finished = false;
  const playback = playQuestionAudio(f.player, new AbortController().signal).then(() => { finished = true; });
  await flush(); assert.deepEqual(f.events, []);
  f.emit({ isLoaded: true }); await flush(); assert.deepEqual(f.events, ['seek', 'play']);
  f.emit({ currentTime: 5.3, didJustFinish: false }); await flush(); assert.equal(finished, false);
  f.emit({ currentTime: 8, didJustFinish: true }); await playback;
  assert.equal(f.events.at(-1), 'pause'); assert.equal(f.listeners.size, 0);
});

test('cancellation during load or seek never starts late playback', async () => {
  for (const stage of ['load', 'seek']) {
    const f = playerFixture(), cancellation = new AbortController(), seeking = deferred();
    if (stage === 'load') f.player.currentStatus.isLoaded = false;
    else f.player.seekTo = () => seeking.promise;
    const playback = playQuestionAudio(f.player, cancellation.signal); await flush();
    cancellation.abort(); await assert.rejects(playback, /cancelled/);
    seeking.resolve(); f.emit({ isLoaded: true }); await flush();
    assert.ok(!f.events.includes('play')); assert.equal(f.listeners.size, 0);
  }
});

test('native playback errors reject instead of releasing countdown', async () => {
  const f = playerFixture(); const playback = playQuestionAudio(f.player, new AbortController().signal);
  await flush(); f.emit({ error: 'network failed' });
  await assert.rejects(playback, /network failed/); assert.equal(f.events.at(-1), 'pause');
  assert.equal(f.listeners.size, 0);
});

// Small hook host runs the real screen/hook code without native hardware.
function hookHost() {
  const slots = []; let cursor = 0, pending = [], dirty = false, renderFn, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    useState(initial) {
      const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (next) => { const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; } }];
    },
    useMemo(factory, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; },
    useCallback(callback, deps) { return hooks.useMemo(() => callback, deps); },
    useRef(initial) { return hooks.useMemo(() => ({ current: initial }), []); },
    useEffect(effect, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) {
      pending.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() }; });
    }},
  };
  function render() { do { dirty = false; cursor = 0; pending = []; tree = renderFn(); for (const effect of pending) effect(); } while (dirty); return tree; }
  return { hooks, mount: (fn) => { renderFn = fn; return render(); },
    flush: async () => { await flush(); if (dirty) render(); await flush(); if (dirty) render(); return tree; },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); },
  };
}
function screenFixture(read = true) {
  const host = hookHost(), f = playerFixture(), stopped = deferred(); let complete = 0;
  const { CameraCheckScreen } = load('screens/CameraCheckScreen.tsx', {
    react: host.hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': { StyleSheet: { create: (styles) => styles }, View: 'View', Text: 'Text' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    'expo-audio': { useAudioPlayer: () => f.player }, '../playQuestionAudio': { playQuestionAudio },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {}, spacing: {}, radius: {}, typography: {} }) },
    '../components/ui/Toggle': { Toggle: 'Toggle' }, '../components/ui/Button': { Button: 'Button' },
    '../components/ui/Chip': { Chip: 'Chip' },
    '../components/ui/Modal': { PopupSheet: 'PopupSheet' },
    '../theme/fonts': { containsDevanagari: () => false, devanagariFontFamily: () => '' },
    '../i18n/useStrings': { useStrings: () => ({ t: (key) => key }) },
    '../useFirstRunTip': { useFirstRunTip: () => ({ visible: false, dismiss() {} }) },
  });
  const props = { questionNumber: 1, totalQuestions: 5, questionText: 'Question', countingDown: true,
    countdownReady: false, readQuestionAloud: read, voPlaybackUrl: 'file:///question.mp3',
    prepareQuestionAudio: () => stopped.promise, onQuestionAudioComplete: () => { complete++; } };
  host.mount(() => CameraCheckScreen(props));
  return { ...f, host, props, stopped, complete: () => complete, render: () => host.mount(() => CameraCheckScreen(props)) };
}
function findButton(node, label) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'Button' && node.props.label === label) return node;
  for (const child of [node.props?.children].flat()) { const found = findButton(child, label); if (found) return found; }
  return null;
}

function rehearseFixture({ readQuestionAloud = true, voPlaybackUrl = 'file:///question.mp3', loaded = true } = {}) {
  const host = hookHost(), f = playerFixture(), exits = [];
  f.player.currentStatus.isLoaded = loaded;
  let appStateChange;
  const appState = {
    currentState: 'active',
    addEventListener(_event, listener) {
      appStateChange = listener;
      return { remove() { appStateChange = undefined; } };
    },
  };
  const element = (type, props) => ({ type, props });
  const { RehearseScreen } = load('screens/RehearseScreen.tsx', {
    react: host.hooks, 'react/jsx-runtime': { jsx: element, jsxs: element },
    'react-native': { AppState: appState, ScrollView: 'ScrollView', StyleSheet: { create: styles => styles }, View: 'View', Text: 'Text' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 0, left: 0, right: 0 }) },
    'expo-audio': { useAudioPlayer: () => f.player, setAudioModeAsync: async () => {} },
    '../playQuestionAudio': { playQuestionAudio },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {}, spacing: {}, radius: {} }) },
    '../components/ui/Modal': { PopupSheet: 'PopupSheet' }, '../components/ui/Button': { Button: 'Button' },
    '../theme/fonts': { containsDevanagari: () => false, devanagariFontFamily: () => '' },
    '../i18n/useStrings': { useStrings: () => ({ t: key => key }) },
  });
  host.mount(() => RehearseScreen({
    questionText: 'What worked well?', voPlaybackUrl, readQuestionAloud,
    onRecordForReal: () => exits.push('record'), onBackToBrief: () => exits.push('brief'),
  }));
  return { ...f, host, exits, background() { appState.currentState = 'background'; appStateChange('background'); } };
}

test('rehearsal reads the question and replays it without starting recording', async () => {
  const f = rehearseFixture();
  try {
    await f.host.flush();
    assert.deepEqual(f.events, ['seek', 'play']);
    f.emit({ didJustFinish: true });
    const screen = await f.host.flush();
    assert.deepEqual(f.exits, []);
    findButton(screen, 'rehearse.playQuestion').props.onPress();
    await f.host.flush();
    assert.equal(f.events.filter(event => event === 'play').length, 2);
  } finally { f.host.unmount(); await flush(); }
});

test('rehearsal respects the read-aloud setting and stops audio when practice finishes', async () => {
  const f = rehearseFixture({ readQuestionAloud: false });
  try {
    const screen = await f.host.flush();
    assert.deepEqual(f.events, []);
    findButton(screen, 'rehearse.playQuestion').props.onPress();
    const playing = await f.host.flush();
    assert.ok(f.events.includes('play'));
    findButton(playing, 'rehearse.finishButton').props.onPress();
    await f.host.flush();
    assert.equal(f.events.at(-1), 'pause');
    assert.equal(f.listeners.size, 0);
    assert.deepEqual(f.exits, []);
  } finally { f.host.unmount(); await flush(); }
});

test('backgrounding rehearsal during audio load prevents late playback', async () => {
  const f = rehearseFixture({ loaded: false });
  try {
    await f.host.flush();
    f.background();
    await f.host.flush();
    f.emit({ isLoaded: true });
    await f.host.flush();
    assert.ok(!f.events.includes('play'));
    assert.equal(f.listeners.size, 0);
  } finally { f.host.unmount(); await flush(); }
});

test('screen waits for microphone shutdown, then question completion, before countdown', async () => {
  const f = screenFixture(); try {
    await f.host.flush(); assert.ok(!f.events.includes('play')); assert.equal(f.complete(), 0);
    f.stopped.resolve(); await f.host.flush(); assert.ok(f.events.includes('play')); assert.equal(f.complete(), 0);
    f.emit({ didJustFinish: true }); await f.host.flush(); assert.equal(f.complete(), 1);
  } finally { f.host.unmount(); }
});

test('read-aloud disabled still waits for microphone shutdown and plays no audio', async () => {
  const f = screenFixture(false); try {
    await f.host.flush(); assert.equal(f.complete(), 0);
    f.stopped.resolve(); await f.host.flush(); assert.equal(f.complete(), 1); assert.ok(!f.events.includes('play'));
  } finally { f.host.unmount(); }
});

test('playback failure offers retry or explicit skip; it never auto-advances', async () => {
  const f = screenFixture(); try {
    f.stopped.resolve(); await f.host.flush(); f.emit({ error: 'failed' });
    let tree = await f.host.flush(); assert.equal(f.complete(), 0);
    const retry = findButton(tree, 'cameraCheck.retryAudio'); assert.ok(retry);
    retry.props.onPress(); await f.host.flush(); assert.ok(f.events.includes('replace'));
    f.emit({ error: 'failed again' }); tree = await f.host.flush(); assert.equal(f.complete(), 0);
    const skip = findButton(tree, 'cameraCheck.skipAudio'); assert.ok(skip);
    skip.props.onPress(); await f.host.flush(); assert.equal(f.complete(), 1);
  } finally { f.host.unmount(); }
});

test('leaving during microphone shutdown cannot start audio or countdown later', async () => {
  const f = screenFixture(); f.host.unmount(); f.stopped.resolve(); await flush();
  assert.ok(!f.events.includes('play')); assert.equal(f.complete(), 0);
});

for (const platform of ['ios', 'android']) test(`${platform}: noise hook enables audio mode only on iOS and stops/deletes samples`, async () => {
  const host = hookHost(), f = microphone(), modes = [];
  const { useAmbientNoiseCheck } = load('useAmbientNoiseCheck.ts', {
    react: host.hooks, 'react-native': { Platform: { OS: platform } },
    'expo-file-system': { File: class { exists = true; delete() { f.events.push('delete'); } } },
    'expo-audio': { RecordingPresets: { LOW_QUALITY: {} }, requestRecordingPermissionsAsync: async () => ({ granted: true }),
      setAudioModeAsync: async (mode) => modes.push(mode), useAudioRecorder: () => f.recorder },
    './ambientNoise': { AmbientNoiseSampler },
  });
  let state; host.mount(() => { state = useAmbientNoiseCheck(true); });
  try {
    await host.flush(); assert.equal(f.recorder.isRecording, true);
    assert.deepEqual(modes, platform === 'ios' ? [{ allowsRecording: true, playsInSilentMode: true }] : []);
    await state.stop(); assert.equal(f.recorder.isRecording, false); assert.ok(f.events.includes('delete'));
  } finally { host.unmount(); await flush(); }
});

function countdownFixture({complete=true,remaining=0,start=()=>Promise.resolve(),current=true}={}) {
  const source=fs.readFileSync(path.join(root,'AppFlow.tsx'),'utf8');
  const ast=ts.createSourceFile('AppFlow.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let callback;
  function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useEffect'&&node.arguments[0]?.getText(ast).includes('camera.startRecording()'))callback=node.arguments[0].getText(ast);ts.forEachChild(node,visit);}
  visit(ast);assert.ok(callback);
  const js=ts.transpileModule(`export const run = ${callback}`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  const timers=[],starts=[],phases=[],errors=[],cancels=[],module={exports:{}};
  new Function('exports','phase','questionAudioComplete','countdownRemaining','COUNTDOWN_SECONDS','setCountdownRemaining','setQuestionAudioComplete','recordingStartedAtRef','cameraRef','setPhase','setTimeout','clearTimeout','handleRecordingError','renderAccountScope','scopeIsCurrent',js)(
   module.exports,'countdown',complete,remaining,5,()=>{},()=>{},{},
   {current:{startRecording:()=>{starts.push(true);return start();},cancelRecording:async()=>cancels.push(true)}},
   phase=>phases.push(phase),(fn,ms)=>{timers.push(ms);return 1;},()=>{},error=>errors.push(error),{},()=>current);
  const cancel=module.exports.run();return {timers,starts,phases,errors,cancels,cancel};
}
test('parent countdown waits for question audio, five ticks and native start acknowledgment',async()=>{
 const blocked=countdownFixture({complete:false,remaining:5});assert.deepEqual(blocked.starts,[]);assert.deepEqual(blocked.phases,[]);
 for(let seconds=5;seconds>0;seconds--)assert.deepEqual(countdownFixture({remaining:seconds}).timers,[1000]);
 const started=deferred();const f=countdownFixture({start:()=>started.promise});assert.deepEqual(f.phases,[]);
 started.resolve();await flush();assert.deepEqual(f.phases,['recording']);
});
test('native start rejection never displays recording; leaving cancels a late start',async()=>{
 const rejected=countdownFixture({start:()=>Promise.reject(new Error('encoder unavailable'))});await flush();assert.deepEqual(rejected.phases,[]);assert.equal(rejected.errors.length,1);
 const started=deferred();const late=countdownFixture({start:()=>started.promise});late.cancel();started.resolve();await flush();assert.deepEqual(late.phases,[]);assert.equal(late.cancels.length,1);
 const stale=countdownFixture({current:false});await flush();assert.deepEqual(stale.phases,[]);assert.equal(stale.cancels.length,1);
});
test('alignment lock cannot advance rehearsal, review or a stale countdown',()=>{
 const source=fs.readFileSync(path.join(root,'AppFlow.tsx'),'utf8');const ast=ts.createSourceFile('AppFlow.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let handler;
 function visit(n){if(ts.isJsxAttribute(n)&&n.name.text==='onLocked')handler=n.initializer.expression.getText(ast);ts.forEachChild(n,visit);}visit(ast);assert.ok(handler);
 const js=ts.transpileModule(`export const run = ${handler}`,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 for(const phase of ['rehearse','brief','countdown','recording','reviewTrim','cameraCheck']){const actions=[],m={exports:{}};new Function('exports','phase','setChecksReady','autoStart','setPhase',js)(m.exports,phase,()=>actions.push('ready'),true,p=>actions.push(p));m.exports.run();assert.deepEqual(actions,phase==='cameraCheck'?['ready','countdown']:[]);}
});

test('loading timeout offers recovery rather than an endless preparation state', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const f = playerFixture(); f.player.currentStatus.isLoaded = false;
  const playback = playQuestionAudio(f.player, new AbortController().signal);
  const rejection = assert.rejects(playback, /timed out/);
  t.mock.timers.tick(15000); await rejection;
  assert.equal(f.events.at(-1), 'pause'); assert.equal(f.listeners.size, 0);
});

test('leaving while audio plays pauses it and ignores a late completion event', async () => {
  const f = screenFixture(); f.stopped.resolve(); await f.host.flush();
  assert.ok(f.events.includes('play')); f.host.unmount(); await flush();
  f.emit({ didJustFinish: true }); await flush();
  assert.equal(f.events.at(-1), 'pause'); assert.equal(f.complete(), 0); assert.equal(f.listeners.size, 0);
});

test('noise readiness requires a measured good result or explicit override', () => {
  const source = fs.readFileSync(path.join(root, 'CameraAlignment.tsx'), 'utf8');
  const ast = ts.createSourceFile('CameraAlignment.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'noiseReady') expression = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(expression);
  const ready = new Function('noise', 'noiseOverridden', `return ${expression};`);
  for (const status of ['checking', 'unavailable', 'noisy']) {
    assert.equal(ready({ status }, false), false); assert.equal(ready({ status }, true), true);
  }
  assert.equal(ready({ status: 'good' }, false), true);
});

test('question prompts are already visible while question audio is preparing and playing', async () => {
  const f = screenFixture();
  f.props.prompts = ['Introduce yourself', 'Your business', 'Your experience'];
  function chips(node, result = []) {
    if (!node || typeof node !== 'object') return result;
    if (node.type === 'Chip') result.push(node.props.label);
    for (const child of [node.props?.children].flat(Infinity)) chips(child, result);
    return result;
  }
  try {
    assert.deepEqual(chips(f.render()), f.props.prompts);
    f.stopped.resolve(); const tree = await f.host.flush();
    assert.deepEqual(chips(tree), f.props.prompts);
  } finally { f.host.unmount(); }
});

function briefFixture(seen = new Set()) {
  const host = hookHost(); let started = 0, practised = 0;
  const { QuestionBriefScreen } = load('screens/QuestionBriefScreen.tsx', {
    react: host.hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    'react-native': { StyleSheet: { create: (s) => s }, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', KeyboardAvoidingView: 'KeyboardAvoidingView', Platform: { OS: 'ios' } },
    'expo-video': { useVideoPlayer: () => ({ pause() {}, play() {}, playing: false }) },
    expo: { useEvent: () => ({ isPlaying: false }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {}, spacing: {}, radius: {}, typography: {} }) },
    '../components/ui/Button': { Button: 'Button' }, '../components/ui/Modal': { PopupSheet: 'PopupSheet' },
    '../components/PromptSelector': { PromptSelector: 'PromptSelector' },
    '../theme/fonts': { containsDevanagari: () => false, devanagariFontFamily: () => '' },
    '../i18n/useStrings': { useStrings: () => ({ t: (key) => key }) },
    '../firstRunTips': { hasSeenTip: (id) => seen.has(id), markTipSeen: (id) => seen.add(id) },
    '../tooltips/HelpButton': { HelpButton: 'HelpButton' }, '../tooltips/TooltipTarget': { TooltipTarget: 'TooltipTarget' },
    '../tooltips/useGuidedTour': { useGuidedTour() {} }, '../tooltips/tooltipRegistry': { QUESTION_TOUR: 'question', QUESTION_TOOLTIP_IDS: [] },
  });
  const props = { questionNumber: 1, totalQuestions: 5, questionText: 'Question', promptSelection: { options: [], selectedIds: [], onToggle() {}, onAdd() {}, onRemove() {}, saveFailed: false },
    onStartRecording: () => started++, onRehearse: () => practised++ };
  let tree = host.mount(() => QuestionBriefScreen(props));
  function sheet(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'PopupSheet') return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = sheet(child); if (found) return found; }
    return null;
  }
  return { host, seen, started: () => started, practised: () => practised,
    tree: () => tree, visible: () => sheet(tree).props.visible,
    async press(label) { const button = findButton(sheet(tree).props.visible ? sheet(tree) : tree, label); assert.ok(button); button.props.onPress(); tree = await host.flush(); },
    async dismiss() { sheet(tree).props.onDismiss(); tree = await host.flush(); },
  };
}

test('first recording tips require a deliberate choice, persist after continue and remain manually accessible', async () => {
  const f = briefFixture();
  await f.press('questionBrief.startRecordingButton'); assert.equal(f.visible(), true); assert.equal(f.started(), 0);
  await f.dismiss(); assert.equal(f.seen.size, 0);
  await f.press('questionBrief.startRecordingButton'); assert.equal(f.visible(), true);
  await f.press('questionBrief.prepContinue'); assert.equal(f.started(), 1); assert.equal(f.visible(), false);
  f.host.unmount();
  const returning = briefFixture(f.seen);
  try {
    await returning.press('questionBrief.startRecordingButton'); assert.equal(returning.started(), 1); assert.equal(returning.visible(), false);
    await returning.press('questionBrief.recordingTipsLink'); assert.equal(returning.visible(), true);
  } finally { returning.host.unmount(); }
});

test('practice from the first-recording tips never starts a recording', async () => {
  const f = briefFixture();
  try {
    await f.press('questionBrief.startRecordingButton');
    await f.press('questionBrief.rehearseButton');
    assert.equal(f.started(), 0); assert.equal(f.practised(), 1); assert.equal(f.visible(), false);
  } finally { f.host.unmount(); }
});

function onboardingFixture(initialLanguage = null) {
  const host = hookHost(), listeners = []; let finished = 0, exited = 0;
  const catalogs = Object.fromEntries(['en', 'hi', 'mr'].map(l => [l, JSON.parse(fs.readFileSync(path.join(root, `i18n/strings.${l}.json`), 'utf8'))]));
  const props = { language: initialLanguage, onChangeLanguage: language => { props.language = language; }, onGetStarted: () => finished++, onBack: () => exited++ };
  const translate = (key, vars = {}) => key.split('.').reduce((v, k) => v[k], catalogs[props.language ?? 'en']).replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? k);
  const { OnboardingScreen } = load('screens/OnboardingScreen.tsx', {
    react: host.hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { create: s => s }, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView',
      useWindowDimensions: () => ({ width: 402, height: 874 }), BackHandler: { addEventListener: (_, fn) => { listeners.push(fn); return { remove: () => listeners.splice(listeners.indexOf(fn), 1) }; } } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 62, bottom: 34 }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {}, themeDark: {}, spacing: {}, radius: {}, typography: {} }) },
    '../theme/fonts': { containsDevanagari: () => false, devanagariFontFamily: () => '' },
    '../i18n/useStrings': { useStrings: () => ({ t: translate }) }, '../components/ui/Button': { Button: 'Button' },
  });
  let tree;const render = () => tree = host.mount(() => OnboardingScreen(props));render();
  function find(node, match) {
    if (!node || typeof node !== 'object') return null;
    if (match(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const result = find(child, match); if (result) return result; }
    return null;
  }
  return { host, props, t: translate, find: match => find(tree, match), finished: () => finished, exited: () => exited,
    async choose(code) { find(tree, n => n.props?.accessibilityRole === 'radio' && n.props.accessibilityLabel === catalogs.en.languageNames[code]).props.onPress();render();await host.flush(); },
    async button(key) { const n = findButton(tree, translate(key)); assert.ok(n, key); if (!n.props.disabled) n.props.onPress(); tree = await host.flush(); },
    async back() { assert.equal(listeners.at(-1)(), true);tree = await host.flush(); },
    async changeLanguage() { find(tree, n => n.type === 'Pressable' && n.props.style?.some?.(s => s.flex === 1)).props.onPress();tree = await host.flush(); },
  };
}

test('onboarding requires a language choice and finishes only after three What/Why/How cards', async () => {
  const f = onboardingFixture();
  try {
    assert.equal(f.find(n => n.type === 'Button' && n.props.label === f.t('onboarding.languageContinue')).props.disabled, true);
    await f.button('onboarding.languageContinue');assert.equal(f.finished(), 0);
    await f.choose('hi');await f.button('onboarding.languageContinue');
    for (let i = 1; i <= 3; i++) {
      assert.ok(f.find(n => n.type === 'Text' && n.props.children === f.t('onboarding.cardProgress', { number: i, total: 3 })));
      assert.equal(f.finished(), 0);
      await f.button(i === 3 ? 'onboarding.getStartedButton' : 'onboarding.nextButton');
    }
    assert.equal(f.finished(), 1);assert.equal(f.props.language, 'hi');
  } finally { f.host.unmount(); }
});

test('changing onboarding language preserves the current card and hardware Back follows the onboarding steps', async () => {
  const f = onboardingFixture('en');
  try {
    await f.button('onboarding.languageContinue');await f.button('onboarding.nextButton');
    await f.changeLanguage();await f.choose('mr');await f.button('onboarding.languageContinue');
    assert.ok(f.find(n => n.type === 'Text' && n.props.children === f.t('onboarding.cardProgress', { number: 2, total: 3 })));
    await f.back();assert.ok(f.find(n => n.type === 'Text' && n.props.children === f.t('onboarding.cardProgress', { number: 1, total: 3 })));
    await f.back();assert.ok(f.find(n => n.props?.accessibilityRole === 'radiogroup'));assert.equal(f.exited(), 0);
    await f.back();assert.equal(f.exited(), 1);
  } finally { f.host.unmount(); }
});

function tourFixture() {
  const host = hookHost(), seen = new Set(), writes = [];
  const registry = load('tooltips/tooltipRegistry.ts');
  const { TooltipProvider } = load('tooltips/TooltipContext.tsx', {
    react: { ...host.hooks, createContext: () => ({ Provider: 'TourProvider' }), useContext() {} },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) },
    '../firstRunTips': { hasSeenTip: id => seen.has(id), markTipSeen: id => { writes.push(id); seen.add(id); } },
    './tooltipRegistry': registry,
  });
  let tree = host.mount(() => TooltipProvider({ children: null }));
  return { host, seen, writes, registry, api: () => tree.props.value,
    async call(method, ...args) { const result = tree.props.value[method](...args); tree = await host.flush(); return result; },
  };
}

test('guided tour preserves registry order, supports Back, and persists only completion', async () => {
  const f = tourFixture();
  try {
    await f.call('startTour', f.registry.HOME_TOUR, [...f.registry.HOME_TOOLTIP_IDS, 'unknown', 'home.overview']);
    assert.deepEqual(f.api().tour.ids, f.registry.HOME_TOOLTIP_IDS);
    assert.equal(f.api().activeId, 'home.overview');
    await f.call('next');assert.equal(f.api().activeId, 'home.profileAvatar');
    await f.call('back');assert.equal(f.api().activeId, 'home.overview');
    assert.equal(f.writes.length, 0);
    for (let i = 0; i < f.registry.HOME_TOOLTIP_IDS.length; i++) await f.call('next');
    assert.equal(f.api().tour, null);assert.deepEqual(f.writes, [f.registry.HOME_TOUR]);
    await f.call('startTour', f.registry.HOME_TOUR, f.registry.HOME_TOOLTIP_IDS);assert.equal(f.api().tour, null);
    await f.call('startTour', f.registry.HOME_TOUR, f.registry.HOME_TOOLTIP_IDS, true);assert.equal(f.api().tour.index, 0);
  } finally { f.host.unmount(); }
});

test('skipping suppresses automatic replay; deliberate help replay always starts at step one', async () => {
  const f = tourFixture();
  try {
    await f.call('startTour', f.registry.QUESTION_TOUR, f.registry.QUESTION_TOOLTIP_IDS);
    await f.call('next');await f.call('skip');assert.equal(f.api().tour, null);
    assert.ok(f.seen.has(f.registry.QUESTION_TOUR));
    await f.call('startTour', f.registry.QUESTION_TOUR, f.registry.QUESTION_TOOLTIP_IDS);assert.equal(f.api().tour, null);
    await f.call('startTour', f.registry.QUESTION_TOUR, f.registry.QUESTION_TOOLTIP_IDS, true);
    assert.equal(f.api().activeId, 'question.text');
  } finally { f.host.unmount(); }
});

test('leaving a page cancels its tour without dismissing a different page tour or marking it complete', async () => {
  const f = tourFixture();
  try {
    await f.call('startTour', f.registry.HOME_TOUR, f.registry.HOME_TOOLTIP_IDS);
    await f.call('leaveTour', f.registry.HOME_TOUR);assert.equal(f.api().tour, null);assert.equal(f.writes.length, 0);
    await f.call('startTour', f.registry.QUESTION_TOUR, ['question.text', 'question.actions']);
    await f.call('leaveTour', f.registry.HOME_TOUR);assert.equal(f.api().activeId, 'question.text');
    await f.call('leaveTour', f.registry.QUESTION_TOUR);assert.equal(f.api().tour, null);
  } finally { f.host.unmount(); }
});

test('a stale target cleanup cannot remove a newer target; absent anchors never reject', async () => {
  const f = tourFixture();
  try {
    const old = f.api().registerTarget('question.text', { prepare: async () => ({ x: 1, y: 2, width: 3, height: 4 }) });
    const latest = f.api().registerTarget('question.text', { prepare: async () => ({ x: 10, y: 20, width: 30, height: 40 }) });
    old();assert.equal((await f.api().prepareTarget('question.text')).x, 10);
    latest();assert.equal(await f.api().prepareTarget('question.text'), undefined);
    await f.call('startTour', 'test', []);assert.equal(f.api().tour, null);
  } finally { f.host.unmount(); }
});

test('tour bubbles stay inside safe areas and off-screen highlights are clipped', () => {
  const { tooltipLayout, visibleTarget } = load('tooltips/tooltipLayout.ts');
  for (const [width, height, top, bottom, bubble] of [[402,874,62,34,260],[320,568,20,0,390],[768,1024,24,20,300]]) {
    for (const target of [{ x: 20, y: 50, width: 50, height: 40 },{ x: 100, y: height-80, width: 90, height: 55 },undefined]) {
      const p = tooltipLayout(target, { width, height }, bubble, { top, bottom });
      assert.ok(p.left >= 16);assert.ok(p.left+p.width <= width-16);
      assert.ok(p.top >= top+12);assert.ok(p.top+bubble <= height-bottom-12);
    }
  }
  assert.equal(visibleTarget({ x: 0, y: -200, width: 50, height: 100 },402,874), undefined);
  assert.deepEqual(visibleTarget({ x: -10, y: 20, width: 40, height: 100 },402,874), { x: 0, y: 20, width: 30, height: 100 });
});

test('only the active target can request remeasurement after a layout change', async () => {
  const f = tourFixture();
  try {
    await f.call('startTour', f.registry.HOME_TOUR, f.registry.HOME_TOOLTIP_IDS);
    const initial = f.api().layoutVersion;
    await f.call('refreshTarget', 'home.profileAvatar');assert.equal(f.api().layoutVersion, initial);
    await f.call('refreshTarget', 'home.overview');assert.equal(f.api().layoutVersion, initial+1);
    await f.call('skip');await f.call('refreshTarget', 'home.overview');assert.equal(f.api().layoutVersion, initial+1);
  } finally { f.host.unmount(); }
});

const promptModel = load('promptSelection.ts');

test('prompt defaults select three at most; a fourth choice requires deselecting one', () => {
  const { resolvePrompts, togglePrompt } = promptModel;
  const initial = resolvePrompts(['One', 'Two', 'Three', 'Four', 'Five']);
  assert.deepEqual(initial.selectedIds, ['default:One', 'default:Two', 'default:Three']);
  assert.deepEqual(togglePrompt(initial, 'default:Four').selectedIds, initial.selectedIds);
  const fewer = resolvePrompts(['One', 'Two', 'Three', 'Four'], togglePrompt(initial, 'default:Two'));
  const changed = resolvePrompts(['One', 'Two', 'Three', 'Four'], togglePrompt(fewer, 'default:Four'));
  assert.deepEqual(changed.selectedIds, ['default:One', 'default:Three', 'default:Four']);
  assert.equal(resolvePrompts([]).selectedIds.length, 0);
  assert.equal(resolvePrompts(['One', 'One', '  One  ', 'Two']).selectedIds.length, 2);
});

test('custom prompts validate whitespace, duplicates and length; a full selection is never silently replaced', () => {
  const { resolvePrompts, addCustomPrompt } = promptModel;
  const initial = resolvePrompts(['One', 'Two', 'Three']);
  assert.equal(addCustomPrompt(initial, ' \n ', 'custom:a').result, 'empty');
  assert.equal(addCustomPrompt(initial, '  ONE ', 'custom:a').result, 'duplicate');
  assert.equal(addCustomPrompt(initial, 'x'.repeat(41), 'custom:a').result, 'tooLong');
  const added = addCustomPrompt(initial, ' My\n first   customer ', 'custom:a');
  assert.equal(added.result, 'unselected');
  assert.deepEqual(added.choice.selectedIds, initial.selectedIds);
  assert.equal(added.choice.custom[0].text, 'My first customer');
  const empty = resolvePrompts([]);
  assert.equal(addCustomPrompt(empty, 'माझा ग्राहक', 'custom:b').result, 'selected');
});

function promptFixture(store = { text: null, writes: 0, fail: false }) {
  const host = hookHost();
  class TestFile {
    get exists() { return store.text != null; }
    textSync() { return store.text; }
    create() { if (store.fail) throw new Error('Disk unavailable'); store.text = ''; }
    write(text) { if (store.fail) throw new Error('Disk unavailable'); store.text = text; store.writes++; }
  }
  const { useQuestionPrompts } = load('useQuestionPrompts.ts', { react: host.hooks,
    'expo-file-system': { File: TestFile, Paths: { document: 'documents' } }, './promptSelection': promptModel });
  const props = { owner: 'person-a', questionId: 'question-a', language: 'en', defaults: ['One', 'Two', 'Three', 'Four'] };
  let value;
  const render = () => { value = useQuestionPrompts(props.owner, props.questionId, props.language, props.defaults); return value; };
  host.mount(render);
  return { host, props, store, value: () => value,
    async edit(action) { const result = action(value.controls); await host.flush(); return result; },
    change(next) { Object.assign(props, next); host.mount(render); },
  };
}

test('prompt choices survive relaunch and question reordering, and remain isolated by account, question and language', async () => {
  const anonymous = promptFixture(); anonymous.change({ owner: null });
  await anonymous.edit(c => c.onAdd('Temporary reminder'));
  assert.equal(anonymous.store.writes, 0, 'an unauthenticated preview must not save account preferences');
  anonymous.change({ owner: 'person-a' });
  assert.equal(anonymous.value().controls.options.some(o => o.custom), false);
  anonymous.host.unmount();
  const f = promptFixture();
  assert.equal(f.store.writes, 0, 'startup must not overwrite saved choices');
  await f.edit(c => c.onToggle('default:One'));
  await f.edit(c => c.onAdd('My example'));
  assert.deepEqual(f.value().prompts, ['Two', 'Three', 'My example']);
  const returning = promptFixture(f.store);
  assert.deepEqual(returning.value().prompts, ['Two', 'Three', 'My example']);
  returning.change({ defaults: ['Four', 'Three', 'Two', 'One'] });
  assert.deepEqual(returning.value().prompts, ['Three', 'Two', 'My example']);
  for (const change of [{ owner: 'person-b' }, { owner: 'person-a', questionId: 'question-b' }, { questionId: 'question-a', language: 'hi' }]) {
    returning.change(change); assert.equal(returning.value().controls.options.some(o => o.custom), false);
    assert.equal(returning.value().prompts.length, 3);
  }
  returning.change({ owner: 'person-a', questionId: 'question-a', language: 'en' });
  assert.ok(returning.value().prompts.includes('My example'));
  f.host.unmount(); returning.host.unmount();
});

test('zero prompts stays zero after restart; removing a custom prompt also removes it from recording reminders', async () => {
  const f = promptFixture();
  for (const id of f.value().controls.selectedIds) await f.edit(c => c.onToggle(id));
  assert.deepEqual(promptFixture(f.store).value().prompts, []);
  await f.edit(c => c.onAdd('Personal example'));
  const id = f.value().controls.options.find(o => o.custom).id;
  assert.deepEqual(f.value().prompts, ['Personal example']);
  await f.edit(c => c.onRemove(id));
  assert.deepEqual(f.value().prompts, []);
  assert.equal(promptFixture(f.store).value().controls.options.some(o => o.custom), false);
});

test('rapid custom additions use the latest choices and cannot exceed three or create duplicates', async () => {
  const f = promptFixture(); f.change({ defaults: [] });
  await f.edit(c => {
    assert.equal(c.onAdd('One'), 'selected');
    assert.equal(c.onAdd('one'), 'duplicate');
    assert.equal(c.onAdd('Two'), 'selected');
    assert.equal(c.onAdd('Three'), 'selected');
    assert.equal(c.onAdd('Four'), 'unselected');
  });
  assert.equal(f.value().prompts.length, 3);
  assert.equal(f.value().controls.options.length, 4);
});

test('malformed prompt storage falls back safely, and write failure keeps the current session usable', async () => {
  const f = promptFixture({ text: '{broken', writes: 0, fail: true });
  assert.deepEqual(f.value().prompts, ['One', 'Two', 'Three']);
  assert.equal(f.store.writes, 0);
  await f.edit(c => c.onToggle('default:One'));
  assert.deepEqual(f.value().prompts, ['Two', 'Three']);
  assert.equal(f.value().controls.saveFailed, true);
  f.store.fail = false; await f.edit(c => c.onAdd('New idea'));
  assert.equal(f.value().controls.saveFailed, false);
  const scope = promptModel.promptScope('person-a', 'question-a', 'en');
  const parsed = promptModel.parsePromptChoices({ version: 1, entries: { bad: {}, [scope]: {
    custom: [{ id: 'default:fake', text: 'bad' }, { id: 'custom:ok', text: '  Good  ' }, { id: 'custom:ok', text: 'Duplicate id' }],
    selectedIds: ['custom:ok', 'custom:ok', false, 'missing'],
  } } });
  assert.equal(Object.keys(parsed).length, 1);
  assert.equal(parsed[scope].custom.length, 1);
  assert.deepEqual(promptModel.resolvePrompts([], parsed[scope]).selectedIds, ['custom:ok']);
  assert.deepEqual(promptModel.parsePromptChoices({ version: 999, entries: {} }), {});
});

test('custom prompt editing keeps recording controls out of the keyboard form and restores them on close', async () => {
  const f = briefFixture();
  function selector(node) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === 'PromptSelector') return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = selector(child); if (found) return found; }
    return null;
  }
  try {
    selector(f.tree()).props.onBeginAdd();
    const editing = await f.host.flush();
    assert.equal(findButton(editing, 'questionBrief.startRecordingButton'), null);
    selector(editing).props.onEndAdd();
    const closed = await f.host.flush();
    assert.ok(findButton(closed, 'questionBrief.startRecordingButton'));
    assert.ok(findButton(closed, 'questionBrief.rehearseButton'));
    assert.equal(f.started(), 0);
  } finally { f.host.unmount(); }
});

const deletion = load('takeDeletion.ts');
const take = (id, questionIndex, isPrimary, trimStartSeconds = 1, trimEndSeconds = 8) => ({
  id, questionIndex, isPrimary, trimStartSeconds, trimEndSeconds, durationSeconds: 10,
  filePath: `file:///recordings/${id}.mp4`, label: `Question ${questionIndex + 1}`,
  captureMetadata: { fileSizeBytes: 100, width: 1080, height: 1920, fps: 30, codec: 'h264', deviceModel: 'test', osVersion: 'test' },
});

test('deleting a primary promotes the remaining saved take and preserves its trim, metadata and unrelated questions', () => {
  const a = take('a', 0, true), b = take('b', 0, false, 2, 7), other = take('c', 1, true);
  const state = { videos: [a, b, other], takesByQuestion: { 2: [take('d', 2)] }, selectedTakeId: 'a', keptTakeIds: ['a', 'b'] };
  const plan = deletion.planTakeDeletion(state, 0, 'a');
  assert.equal(plan.next.selectedTakeId, 'b');
  assert.deepEqual(plan.next.videos, [{ ...b, isPrimary: true }, other]);
  assert.deepEqual(plan.next.keptTakeIds, ['b']);
  assert.equal(plan.next.takesByQuestion[2], state.takesByQuestion[2]);
  assert.equal(plan.fileToDelete, a.filePath);
  assert.deepEqual(state.videos, [a, b, other], 'planning must not mutate the live state');
});

test('deleting a secondary preserves the primary and preview; deleting a pending take does not finalize other pending takes', () => {
  const a = take('a', 0, true), b = take('b', 0, false), c = take('c', 0, undefined, 3, 6), d = take('d', 0);
  const state = { videos: [a, b], takesByQuestion: { 0: [c, d] }, selectedTakeId: 'c', keptTakeIds: ['a', 'c'] };
  const secondary = deletion.planTakeDeletion(state, 0, 'b');
  assert.equal(secondary.next.selectedTakeId, 'c'); assert.deepEqual(secondary.next.videos, [a]);
  const pending = deletion.planTakeDeletion(state, 0, 'c');
  assert.equal(pending.next.selectedTakeId, 'a');
  assert.deepEqual(pending.next.videos, [a, b]);
  assert.deepEqual(pending.next.takesByQuestion[0], [d]);
  assert.deepEqual(pending.next.keptTakeIds, ['a']);
});

test('deleting the last saved take leaves a pending take unkept; deleting the final take reopens the correct question', () => {
  const a = take('a', 1, true), pending = take('new', 1), other = take('other', 0, true);
  const withPending = deletion.planTakeDeletion({ videos: [other, a], takesByQuestion: { 1: [pending] }, selectedTakeId: 'a' }, 1, 'a');
  assert.deepEqual(withPending.next.videos, [other]);
  assert.deepEqual(withPending.remaining, [pending]);
  assert.equal(withPending.next.selectedTakeId, 'new');
  const last = deletion.planTakeDeletion({ videos: [other, a, take('q3', 2, true)], takesByQuestion: {}, selectedTakeId: 'a', keptTakeIds: ['a'] }, 1, 'a');
  assert.equal(last.next.selectedTakeId, null); assert.deepEqual(last.remaining, []); assert.deepEqual(last.next.keptTakeIds, []);
  assert.equal(deletion.firstUnansweredQuestion(last.next.videos, 3), 1);
  assert.equal(deletion.firstUnansweredQuestion([other, a, take('q3', 2, true)], 3), null);
  assert.equal(deletion.firstUnansweredQuestion([], 3), 0);
});

test('deletion does not unlink a shared file or act on an ID belonging to another question', () => {
  const a = take('a', 0, true), b = { ...take('b', 1, true), filePath: a.filePath };
  const state = { videos: [a, b], takesByQuestion: {}, selectedTakeId: 'a' };
  assert.equal(deletion.planTakeDeletion(state, 0, 'a').fileToDelete, undefined);
  assert.equal(deletion.planTakeDeletion(state, 0, 'b'), null);
  assert.equal(deletion.planTakeDeletion(state, 0, 'missing'), null);
  const legacy = deletion.planTakeDeletion({ videos: [take('a', 0, undefined), take('b', 0, false)], takesByQuestion: {}, selectedTakeId: 'b' }, 0, 'b');
  assert.equal(legacy.next.videos[0].isPrimary, true);
});

test('deletion checkpoints before unlinking, never unlinks after a failed save, and rolls back a failed file deletion', () => {
  const previous = { id: 'old' }, next = { id: 'new' }, events = [];
  deletion.commitTakeDeletion(previous, next, 'file:///a.mp4', state => events.push(state), file => events.push(file));
  assert.deepEqual(events, [next, 'file:///a.mp4']);
  assert.throws(() => deletion.commitTakeDeletion(previous, next, 'file:///a.mp4', () => { throw new Error('Disk full'); }, () => assert.fail('must not unlink')), /Disk full/);
  const rollback = [];
  assert.throws(() => deletion.commitTakeDeletion(previous, next, 'file:///a.mp4', state => rollback.push(state), () => { throw new Error('Permission denied'); }), /Permission denied/);
  assert.deepEqual(rollback, [next, previous]);
});

function reviewDeleteFixture(fail = false, editable = true) {
  const host = hookHost(), deleted = [], selected = [], pauses = [];
  const reviewPlayer = { pause: () => pauses.push('pause'), playing: false, duration: 10, addListener: () => ({ remove() {} }) };
  const { ReviewTrimScreen } = load('screens/ReviewTrimScreen.tsx', {
    react: host.hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { create: s => s }, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', PanResponder: { create: () => ({ panHandlers: {} }) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 34 }) },
    'expo-video': { useVideoPlayer: () => reviewPlayer, VideoView: 'VideoView' },
    '../trim': load('trim.ts', { './uploadProtocol': { MAX_DURATION_MS: 180000 } }),
    expo: { useEvent: () => ({ isPlaying: false }) },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {}, spacing: {}, radius: {} }) },
    '../components/ui/Button': { Button: 'Button' }, '../components/ui/ProgressBar': { ProgressBar: 'ProgressBar' },
    '../components/ui/Toggle': { Toggle: 'Toggle' }, '../components/ui/Modal': { PopupSheet: 'PopupSheet' },
    '../recordings': { MAX_KEPT_TAKES: 2 },
    '../theme/fonts': { containsDevanagari: () => false, devanagariFontFamily: () => '' },
    '../i18n/useStrings': { useStrings: () => ({ t: (key, vars) => key === 'takeDeletion.deleteLabel' ? `${key}-${vars.number}` : key }) },
  });
  const props = { questionNumber: 1, totalQuestions: 5, recordedQuestions: 1,
    takes: [{ ...take('a', 0, true), saved: true }, { ...take('b', 0, false), saved: true }], selectedTakeId: 'a',
    keptTakeIds: ['a', 'b'], onSelectTake: id => selected.push(id), onChangeTrim() {}, onToggleKept() {}, onRecordAnother() {}, onKeep() {},
    onDeleteTake: editable ? id => { if (fail) throw new Error('File unavailable'); deleted.push(id); } : undefined };
  let tree = host.mount(() => ReviewTrimScreen(props));
  function find(node, predicate) {
    if (!node || typeof node !== 'object') return null;
    if (predicate(node)) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const value = find(child, predicate); if (value) return value; }
    return null;
  }
  return { host, props, deleted, selected, pauses, tree: () => tree,
    visible: () => find(tree, n => n.type === 'PopupSheet').props.visible,
    async request(number) { const action = find(tree, n => n.props?.accessibilityLabel === `takeDeletion.deleteLabel-${number}`); assert.ok(action); action.props.onPress({ stopPropagation() {} }); tree = await host.flush(); },
    async cancel() { find(tree, n => n.props?.accessibilityLabel === 'takeDeletion.cancel').props.onPress(); tree = await host.flush(); },
    async dismiss() { find(tree, n => n.type === 'PopupSheet').props.onDismiss(); tree = await host.flush(); },
    async confirm() { const action = find(tree, n => n.type === 'Pressable' && n.props?.children?.props?.children === 'takeDeletion.confirm'); assert.ok(action); action.props.onPress(); tree = await host.flush(); },
    hasDelete: () => !!find(tree, n => n.props?.accessibilityLabel?.startsWith('takeDeletion.deleteLabel')),
    hasError: () => !!find(tree, n => n.props?.accessibilityRole === 'alert'),
  };
}

test('delete requires explicit confirmation; Cancel/backdrop leave the take and primary selection untouched', async () => {
  const f = reviewDeleteFixture();
  await f.request(2); assert.equal(f.visible(), true); assert.deepEqual(f.deleted, []); assert.deepEqual(f.selected, []); assert.ok(f.pauses.length);
  await f.cancel(); assert.equal(f.visible(), false); assert.deepEqual(f.deleted, []);
  await f.request(1); await f.dismiss(); assert.deepEqual(f.deleted, []);
  await f.request(2); await f.confirm(); assert.deepEqual(f.deleted, ['b']); assert.equal(f.visible(), false);
  f.host.unmount();
});

test('delete failures keep the confirmation open; uploaded/locked review has no delete controls', async () => {
  const failing = reviewDeleteFixture(true);
  await failing.request(1); await failing.confirm();
  assert.equal(failing.visible(), true); assert.equal(failing.hasError(), true); assert.deepEqual(failing.deleted, []);
  await failing.cancel(); assert.equal(failing.visible(), false); failing.host.unmount();
  const locked = reviewDeleteFixture(false, false); assert.equal(locked.hasDelete(), false); locked.host.unmount();
});

const feedbackModel = load('completionFeedback.ts');
test('saved milestones count each question once and distinguish first save, retake and newly completed campaign', () => {
  const a = take('a', 0, true), b = take('b', 1, true), c = take('c', 2, true), retake = take('retake', 0, false);
  assert.equal(feedbackModel.savedFeedback([], [a], 0, 3, 1, 'postKeep').kind, 'first');
  const second = feedbackModel.savedFeedback([a], [a, b], 1, 3, 2, 'postKeep');
  assert.deepEqual([second.kind, second.previousCompleted, second.completed, second.total], ['saved', 1, 2, 3]);
  const updated = feedbackModel.savedFeedback([a, b, c], [a, retake, b, c], 0, 3, 3, 'myVideos');
  assert.equal(updated.kind, 'updated'); assert.equal(updated.completed, 3); assert.equal(updated.previousCompleted, 3);
  const all = feedbackModel.savedFeedback([a, b], [a, b, c], 2, 3, 4, 'home');
  assert.equal(all.kind, 'allSaved'); assert.equal(all.completed, 3);
  assert.notEqual(feedbackModel.savedFeedback([], [], 0, 0, 5, 'home').kind, 'allSaved');
});

test('upload success requires every current primary question to be confirmed; duplicates, old indices and an empty batch cannot complete it', () => {
  const videos = [take('a', 0, true), take('backup', 0, false), take('c', 2, true)];
  assert.deepEqual(feedbackModel.confirmedUploadSummary(videos, [0, 0, 1]), { total: 2, completed: 1, complete: false, progress: 0.5 });
  assert.deepEqual(feedbackModel.confirmedUploadSummary(videos, [0, 2]), { total: 2, completed: 2, complete: true, progress: 1 });
  assert.equal(feedbackModel.confirmedUploadSummary([], []).complete, false);
});

function motionFixture(initial, token) {
  const host = hookHost(), events = [], listeners = new Set();
  let resolve, reject;
  const query = { promise: new Promise((yes, no) => { resolve = yes; reject = no; }), resolve: value => resolve(value), reject: error => reject(error) };
  let id = initial, value;
  class Value {
    constructor(value) { this.value = value; }
    setValue(value) { this.value = value; }
    stopAnimation() { events.push('stopValue'); }
  }
  const { useMilestoneMotion } = load('useMilestoneMotion.ts', {
    react: host.hooks, 'react-native': {
      AccessibilityInfo: { isReduceMotionEnabled: () => query.promise, addEventListener: (name, callback) => {
        assert.equal(name, 'reduceMotionChanged'); listeners.add(callback); return { remove: () => listeners.delete(callback) };
      } },
      Animated: { Value, timing: (value, options) => ({ start() { events.push(options); value.setValue(options.toValue); }, stop() { events.push('stopAnimation'); } }) },
    },
  });
  const render = () => { value = useMilestoneMotion(id, token); return value; };host.mount(render);
  return { host, events, listeners, query, value: () => value,
    async preference(value) { query.resolve(value); await host.flush(); },
    async change(value) { for (const listener of listeners) listener(value); await host.flush(); },
    render(value) { id = value; host.mount(render); },
    animations: () => events.filter(event => typeof event === 'object'),
  };
}

test('milestone motion plays once for a new action, stays quiet on rerender and uses a short native animation', async () => {
  const f = motionFixture(1);assert.equal(f.animations().length, 0);
  await f.preference(false);assert.equal(f.animations().length, 1);
  assert.deepEqual(f.animations()[0], { toValue: 1, duration: 280, useNativeDriver: true, isInteraction: false });
  f.render(1);assert.equal(f.animations().length, 1);
  f.render(2);assert.equal(f.animations().length, 2);
  f.host.unmount();assert.equal(f.listeners.size, 0);
});

test('Reduce Motion suppresses a milestone and stops an active one without replaying when the setting changes back', async () => {
  const reduced = motionFixture(1);await reduced.preference(true);
  assert.equal(reduced.animations().length, 0);assert.equal(reduced.value().value, 1);
  await reduced.change(false);assert.equal(reduced.animations().length, 0);reduced.host.unmount();
  const active = motionFixture(1);await active.preference(false);await active.change(true);
  assert.equal(active.value().value, 1);assert.ok(active.events.includes('stopAnimation'));
  await active.change(false);assert.equal(active.animations().length, 1);active.host.unmount();
});

test('the same saved event cannot replay after its card remounts during library loading', async () => {
  const token = { current: false };
  const first = motionFixture(1, token);await first.preference(false);assert.equal(first.animations().length, 1);first.host.unmount();
  const remount = motionFixture(1, token);await remount.preference(false);assert.equal(remount.animations().length, 0);assert.equal(remount.value().value, 1);remount.host.unmount();
});

test('an unavailable or late motion preference cannot animate an unmounted milestone or override a newer setting', async () => {
  const unavailable = motionFixture(1);unavailable.query.reject(new Error('Preference unavailable'));await unavailable.host.flush();
  assert.equal(unavailable.animations().length, 0);assert.equal(unavailable.value().value, 1);unavailable.host.unmount();
  const failing = motionFixture(1);
  // A live setting event wins over the earlier asynchronous preference query.
  await failing.change(true);await failing.preference(false);
  assert.equal(failing.animations().length, 0);assert.equal(failing.value().value, 1);failing.host.unmount();
  const gone = motionFixture(1);gone.host.unmount();await gone.preference(false);assert.equal(gone.animations().length, 0);
});

function confirmationFixture(uploading = true) {
  const host = hookHost();
  const { ConfirmationScreen } = load('screens/ConfirmationScreen.tsx', {
    react: host.hooks, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 24, bottom: 24, left: 0, right: 0 }) },
    'react-native': { StyleSheet: { create: s => s }, View: 'View', Text: 'Text', ActivityIndicator: 'ActivityIndicator' },
    '../theme/ThemeContext': { useTheme: () => ({ colors: {}, spacing: {}, radius: {}, typography: {} }) },
    '../components/ui/Button': { Button: 'Button' }, '../components/ui/ProgressBar': { ProgressBar: 'ProgressBar' },
    '../components/CompletionFeedback': { CompletionCheckmark: 'CompletionCheckmark' },
    '../theme/fonts': { containsDevanagari: () => false, devanagariFontFamily: () => '' },
    '../i18n/useStrings': { useStrings: () => ({ t: key => key }) },
  });
  const props = { uploading, progress: uploading ? 0 : 1, confirmedCount: uploading ? 0 : 3, totalCount: 3, reelsEnabled: false, onDone() {} };
  const render = () => host.mount(() => ConfirmationScreen(props));
  function find(node, type) {
    if (!node || typeof node !== 'object') return null;
    if (node.type === type) return node;
    for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, type); if (found) return found; }
    return null;
  }
  return { host, props, render, mark: () => find(render(), 'CompletionCheckmark') };
}

test('upload checkmark animates only on the confirmed sending-to-complete transition; reopening complete is static', () => {
  const f = confirmationFixture();assert.equal(f.mark(), null);
  Object.assign(f.props, { uploading: false, confirmedCount: 3, progress: 1 });
  assert.equal(f.mark().props.eventId, 1);assert.equal(f.mark().props.eventId, 1);
  f.host.unmount();
  const reopened = confirmationFixture(false);assert.equal(reopened.mark().props.eventId, undefined);reopened.host.unmount();
  const incomplete = confirmationFixture();incomplete.render();Object.assign(incomplete.props, { uploading: false, confirmedCount: 1 });
  assert.equal(incomplete.mark(), null);incomplete.host.unmount();
});

test('release question preparation excludes fictional sample participants',()=>{const f=briefFixture();try{assert.equal(JSON.stringify(f.tree()).includes('questionBrief.sampleAnswerTitle'),false);}finally{f.host.unmount();}});
