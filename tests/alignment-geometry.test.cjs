const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Execute production TypeScript with disposable native boundaries. No camera,
// simulator, microphone, filesystem state, or network is involved.
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'console', js)((id) => {
    if (id in mocks) return mocks[id];
    throw new Error(`Unexpected runtime dependency: ${id}`);
  }, module, module.exports, { log() {}, warn() {}, error() {} });
  return module.exports;
}
const alignment = load('alignment.ts');

function host() {
  const slots = []; let cursor = 0, pending = [], dirty = false, renderFn, tree;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const hooks = {
    forwardRef: (fn) => fn,
    useState(initial) {
      const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (next) => {
        const value = typeof next === 'function' ? next(slots[i].value) : next;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useMemo(factory, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { value: factory(), deps }; return slots[i].value; },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useRef(initial) { return hooks.useMemo(() => ({ current: initial }), []); },
    useEffect(effect, deps) {
      const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) pending.push(() => {
        slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: effect() };
      });
    },
    useImperativeHandle(ref, factory, deps) { hooks.useEffect(() => { ref.current = factory(); return () => { ref.current = null; }; }, deps); },
  };
  function render() {
    let iterations = 0;
    do {
      assert.ok(iterations++ < 30, 'hook fixture must settle');
      dirty = false; cursor = 0; pending = []; tree = renderFn();
      for (const effect of pending) effect();
    } while (dirty);
    return tree;
  }
  return { hooks, mount(fn) { renderFn = fn; return render(); }, render,
    tree: () => tree, unmount() { for (const slot of slots) slot?.cleanup?.(); } };
}
const jsx = { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
function find(tree, type) {
  if (tree?.type === type) return tree;
  for (const child of [tree?.props?.children].flat(Infinity)) {
    if (child && typeof child === 'object') { const result = find(child, type); if (result) return result; }
  }
  return null;
}
function appFlowCameraHandler(attribute, state) {
  const source = fs.readFileSync(path.join(root, 'AppFlow.tsx'), 'utf8');
  const ast = ts.createSourceFile('AppFlow.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === attribute) expression = node.initializer.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(expression, `actual AppFlow camera ${attribute} handler exists`);
  const js = ts.transpileModule(`export const handler = ${expression}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  return () => {
    const module = { exports: {} };
    new Function('exports', 'phase', 'autoStart', 'setChecksReady', 'setPhase', js)(module.exports,
      state.phase, state.autoStart, (ready) => { state.ready = ready; }, (phase) => { state.phase = phase; });
    return module.exports.handler();
  };
}

function cameraFixture(width = 834, height = 1194, noiseStatus = 'good') {
  const h = host(), ref = { current: null };
  const permission = { hasPermission: true, canRequestPermission: true, requestPermission: async () => true };
  const noise = { status: noiseStatus, sustainedNoisy: false, stop: async () => {}, retry() {} };
  const detector = { currentResolution: { width: 1920, height: 1080 } };
  const video = { currentResolution: { width: 1920, height: 1080 } };
  let options, locks = 0;
  const window = { width, height };
  const native = { StyleSheet: { create: (s) => s, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
    View: 'View', Text: 'Text', Pressable: 'Pressable', Linking: {}, useWindowDimensions: () => window };
  const { useAlignmentLock } = load('useAlignmentLock.ts', { react: h.hooks });
  const { CameraAlignment } = load('CameraAlignment.tsx', {
    react: h.hooks, 'react/jsx-runtime': jsx, 'react-native': native,
    'react-native-vision-camera': { Camera: 'Camera', CommonResolutions: { FHD_16_9: { width: 1920, height: 1080 } },
      useCameraDevice: () => ({}), useCameraPermission: () => permission, useMicrophonePermission: () => permission, useVideoOutput: () => video },
    'react-native-vision-camera-face-detector': { useFaceDetectorOutput: (value) => { options = value; return detector; } },
    './AlignmentGuideOverlay': { AlignmentGuideOverlay: 'AlignmentGuideOverlay' }, './AlignmentStatusStrip': { AlignmentStatusStrip: 'AlignmentStatusStrip' },
    './alignment': alignment, './useAlignmentLock': { useAlignmentLock }, './useAmbientNoiseCheck': { useAmbientNoiseCheck: () => noise },
    './i18n/useStrings': { useStrings: () => ({ t: (key) => key }) },
  });
  const props = { lockMode: 'initial', resetToken: 1, onLocked: () => locks++, alignmentActive: true,
    recordingActive: false, onRecordingFinished() {}, onRecordingError() {} };
  h.mount(() => CameraAlignment(props, ref));
  return { ...h, props, window, noise, detector, options: () => options, locks: () => locks,
    faces(faces) { options.onFacesDetected(faces); h.render(); },
    layout(width, height, x = 0, y = 0) {
      const node = find(h.tree(), 'View'); assert.equal(typeof node.props.onLayout, 'function', 'camera preview must measure its rendered layout');
      node.props.onLayout({ nativeEvent: { layout: { x, y, width, height } } }); h.render();
    },
    guide: () => find(h.tree(), 'AlignmentGuideOverlay'), strip: () => find(h.tree(), 'AlignmentStatusStrip'), camera: () => find(h.tree(), 'Camera'),
  };
}

test('legacy fixed guide becomes mathematically unreachable above 815.314 points', () => {
  const maximumContainedWidth = 246 * 1.16;
  assert.ok(Math.abs(maximumContainedWidth - 285.36) < 1e-10);
  assert.ok(815 * 0.35 <= maximumContainedWidth);
  for (const width of [816, 834, 1024, 1032]) assert.ok(width * 0.35 > maximumContainedWidth);
});

test('invalid or unavailable face/preview geometry always fails closed', () => {
  const valid = { x: 110, y: 230, width: 170, height: 230 };
  for (const bounds of [null, undefined, {}, { ...valid, width: 0 }, { ...valid, height: 0 },
    { ...valid, width: -1 }, { ...valid, height: -1 }, ...['x', 'y', 'width', 'height'].flatMap((key) =>
      [NaN, Infinity, -Infinity, undefined].map((value) => ({ ...valid, [key]: value })))]) {
    assert.equal(alignment.isFullyAligned(alignment.computeAlignmentSignals(bounds, 390, 844)), false);
  }
  for (const [width, height] of [[0, 844], [390, 0], [-390, 844], [390, -844], [NaN, 844], [390, Infinity]]) {
    assert.equal(alignment.isFullyAligned(alignment.computeAlignmentSignals(valid, width, height)), false);
  }
});

const sizes = [
  ['small phone', 320, 568], ['Android phone', 360, 800], ['iPhone', 390, 844], ['large phone', 430, 932],
  ['wide Android phone', 440, 956], ['600-point phone', 600, 1000],
  ['legacy boundary below', 815, 1194], ['legacy boundary above', 816, 1194],
  ['iPad 834', 834, 1194], ['iPad 1024', 1024, 1366], ['iPad 1032', 1032, 1376],
  ['Android resized landscape', 800, 360], ['tablet landscape', 1194, 834],
];
function idealFace(width, height) {
  const guide = alignment.getAlignmentGeometry(width, height);
  assert.ok(guide, 'valid viewport has a guide');
  return { x: guide.left + guide.width * 0.05, y: guide.top + guide.height * 0.1,
    width: guide.width * 0.9, height: guide.height * 0.8 };
}
test('all three alignment signals are attainable on full-screen iPads, phones and resized layouts', () => {
  for (const [label, width, height] of sizes) {
    const face = idealFace(width, height);
    assert.deepEqual(alignment.computeAlignmentSignals(face, width, height), { centered: true, distanceOk: true, headroomOk: true }, label);
    const guide = alignment.getAlignmentGeometry(width, height);
    assert.ok(guide.left >= 0 && guide.top >= 0 && guide.left + guide.width <= width && guide.top + guide.height <= height, label);
    for (const outside of [{ ...face, x: -face.width }, { ...face, x: width }, { ...face, y: height },
      { ...face, y: -face.height }, { ...face, width: width * 0.9 }, { ...face, width: 1 }]) {
      assert.equal(alignment.isFullyAligned(alignment.computeAlignmentSignals(outside, width, height)), false, `${label}: reject outward/too-near/too-far face`);
    }
    // The face center can remain in the oval while the chin extends past
    // its tolerated boundary; containment must examine the whole box.
    const chinOutside = { ...face, y: guide.top + guide.height * 0.3 };
    assert.equal(alignment.computeAlignmentSignals(chinOutside, width, height).centered, false, `${label}: chin outside with center still inside`);
  }
});

test('reference phone guide retains its tuned dimensions and vertical position', () => {
  for (const width of [320, 360, 390, 430, 440, 600]) {
    const geometry = alignment.getAlignmentGeometry(width, 850);
    assert.equal(geometry.width, 246); assert.equal(geometry.height, 330);
    assert.equal(geometry.left, (width - 246) / 2); assert.ok(Math.abs(geometry.top - 230) < 1e-10);
  }
});

test('phone distance thresholds remain at 35% and 75% of measured preview width', () => {
  for (const width of [320, 360, 390, 430, 440, 600]) {
    for (const [ratio, expected] of [[0.349, false], [0.35, true], [0.5, true], [0.75, true], [0.751, false]]) {
      const faceWidth = width * ratio;
      assert.equal(alignment.computeAlignmentSignals({ x: (width - faceWidth) / 2, y: 230, width: faceWidth, height: 100 }, width, 850).distanceOk,
        expected, `${width}, ${ratio}`);
    }
  }
});

test('drawn guide consumes exactly the same local rectangle used by the checks', () => {
  for (const [, width, height] of sizes) {
    const h = host(), geometry = alignment.getAlignmentGeometry(width, height);
    const { AlignmentGuideOverlay } = load('AlignmentGuideOverlay.tsx', {
      react: h.hooks, 'react/jsx-runtime': jsx,
      'react-native': { StyleSheet: { create: (s) => s }, View: 'View', Text: 'Text',
        Animated: { View: 'AnimatedView', Value: class { constructor(value) { this.value = value; } }, timing: () => ({ start() {} }) } },
      './theme/ThemeContext': { useTheme: () => ({ themeDark: { text: '#fff', accent: '#0f0' } }) },
      './i18n/useStrings': { useStrings: () => ({ t: (key) => key }) },
    });
    try {
      const tree = h.mount(() => AlignmentGuideOverlay({ visible: true, geometry, signals: null, goodFrameStreak: 0, requiredFrames: 40 }));
      const style = Object.assign({}, ...find(tree, 'View').props.style.filter(Boolean));
      for (const key of ['left', 'top', 'width', 'height']) assert.equal(style[key], geometry[key]);
      assert.equal(style.position, 'absolute'); assert.equal(tree.props.pointerEvents, 'none');
    } finally { h.unmount(); }
  }
});

test('real CameraAlignment callback reaches its lock on full-screen tablets and phones using measured preview coordinates', () => {
  for (const [, width, height] of sizes) {
    const f = cameraFixture(width + 100, height + 100);
    try {
      f.layout(width, height, 17, 41);
      assert.equal(f.options().autoMode, true);
      assert.equal(f.options().windowWidth, width); assert.equal(f.options().windowHeight, height);
      assert.deepEqual(f.guide().props.geometry, alignment.getAlignmentGeometry(width, height));
      // Preserve VisionCamera's existing default cover mode. These tests
      // prove the returned plugin-coordinate contract, not native crop or
      // mirroring calibration, which still requires actual-device footage.
      assert.equal(f.camera().props.resizeMode ?? 'cover', 'cover');
      const bounds = idealFace(width, height);
      for (let i = 0; i < 40; i++) f.faces([{ bounds }]);
      assert.equal(f.locks(), 1, `${width}x${height}`);
      assert.equal(f.guide().props.visible, false);
    } finally { f.unmount(); }
  }
});

test('rehearsal hides both recording checks and starts a fresh lock on real recording setup', () => {
  const f = cameraFixture(360, 800);
  try {
    f.props.alignmentActive = false;
    f.render();
    f.layout(360, 800);
    const bounds = idealFace(360, 800);
    for (let i = 0; i < 45; i++) f.faces([{ bounds }]);
    assert.equal(f.guide().props.visible, false);
    assert.equal(f.strip().props.visible, false);
    assert.equal(f.locks(), 0);

    f.props.alignmentActive = true;
    f.props.resetToken++;
    f.render();
    assert.equal(f.guide().props.visible, true);
    assert.equal(f.strip().props.visible, true);
    for (let i = 0; i < 39; i++) f.faces([{ bounds }]);
    assert.equal(f.locks(), 0);
    f.faces([{ bounds }]);
    assert.equal(f.locks(), 1);
  } finally { f.unmount(); }
});

test('camera cannot lock before preview measurement or retain partial streak on missing faces', () => {
  const f = cameraFixture();
  try {
    const bounds = idealFace(834, 1194);
    for (let i = 0; i < 45; i++) f.faces([{ bounds }]);
    assert.equal(f.locks(), 0);
    f.layout(834, 1194);
    for (let i = 0; i < 30; i++) f.faces([{ bounds }]);
    f.faces([{}]); f.faces([]);
    for (let i = 0; i < 20; i++) f.faces([{ bounds }]);
    assert.equal(f.locks(), 0, 'missing face resets partial streak');
    for (let i = 0; i < 20; i++) f.faces([{ bounds }]);
    assert.equal(f.locks(), 1);
  } finally { f.unmount(); }
});

test('Android window rotation/onLayout resize resets partial lock and updates guide/detector together', () => {
  const f = cameraFixture(360, 800);
  try {
    f.layout(360, 800);
    const before = idealFace(360, 800);
    for (let i = 0; i < 30; i++) f.faces([{ bounds: before }]);
    Object.assign(f.window, { width: 800, height: 360 }); f.render();
    f.layout(800, 360, 48, 24);
    assert.equal(f.options().windowWidth, 800); assert.equal(f.options().windowHeight, 360);
    assert.deepEqual(f.guide().props.geometry, alignment.getAlignmentGeometry(800, 360));
    const after = idealFace(800, 360);
    for (let i = 0; i < 20; i++) f.faces([{ bounds: after }]);
    assert.equal(f.locks(), 0, 'a different preview cannot inherit the old streak');
    for (let i = 0; i < 20; i++) f.faces([{ bounds: after }]);
    assert.equal(f.locks(), 1);
  } finally { f.unmount(); }
});

test('late callbacks from old layouts cannot finish a lock during or after resize', () => {
  const f = cameraFixture(834, 1194);
  try {
    f.layout(834, 1194);
    const oldCallback = f.options().onFacesDetected, oldFace = idealFace(834, 1194);
    for (let i = 0; i < 39; i++) f.faces([{ bounds: oldFace }]);
    // Dispatch a stale native callback after onLayout synchronously invalidates
    // refs, before React gets its first chance to render the new dimensions.
    find(f.tree(), 'View').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 1024, height: 1366 } } });
    for (let i = 0; i < 45; i++) oldCallback([{ bounds: oldFace }]);
    f.render(); assert.equal(f.locks(), 0);
    for (let i = 0; i < 45; i++) oldCallback([{ bounds: oldFace }]);
    f.render(); assert.equal(f.locks(), 0);
    f.layout(0, 0);
    assert.equal(f.guide().props.visible, false);
    for (let i = 0; i < 45; i++) f.faces([{ bounds: oldFace }]);
    assert.equal(f.locks(), 0);
    f.layout(1024, 1366);
    const face = idealFace(1024, 1366);
    for (let i = 0; i < 40; i++) f.faces([{ bounds: face }]);
    assert.equal(f.locks(), 1);
  } finally { f.unmount(); }
});

test('inactive or recording camera callbacks cannot acquire a setup lock', () => {
  for (const patch of [{ alignmentActive: false }, { recordingActive: true }]) {
    const f = cameraFixture();
    try {
      f.layout(834, 1194); Object.assign(f.props, patch); f.render();
      for (let i = 0; i < 45; i++) f.faces([{ bounds: idealFace(834, 1194) }]);
      assert.equal(f.locks(), 0);
    } finally { f.unmount(); }
  }
});

test('a successful lock enables manual recording and only advances auto mode to countdown', () => {
  const source = fs.readFileSync(path.join(root, 'AppFlow.tsx'), 'utf8');
  const ast = ts.createSourceFile('AppFlow.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let handler;
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.text === 'onLocked') handler = node.initializer.expression.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast); assert.ok(handler);
  const js = ts.transpileModule(`export const callback = ${handler}`, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  for (const autoStart of [false, true]) {
    const actions = [], module = { exports: {} };
    new Function('exports', 'phase', 'autoStart', 'setChecksReady', 'setPhase', js)(module.exports,
      'cameraCheck', autoStart, (ready) => actions.push(['ready', ready]), (phase) => actions.push(['phase', phase]));
    module.exports.callback();
    assert.deepEqual(actions, autoStart ? [['ready', true], ['phase', 'countdown']] : [['ready', true]]);
  }
});

test('noise override cannot bypass failed alignment or retain a broken lock during noise hold', () => {
  const f = cameraFixture(834, 1194, 'noisy');
  try {
    f.layout(834, 1194);
    for (let i = 0; i < 45; i++) f.faces([{ bounds: { x: 0, y: 0, width: 5, height: 5 } }]);
    f.strip().props.onOverrideNoise(); f.render(); assert.equal(f.locks(), 0);
    f.props.resetToken++; f.render();
    const bounds = idealFace(834, 1194);
    for (let i = 0; i < 40; i++) f.faces([{ bounds }]);
    assert.equal(f.locks(), 0, 'noise holds a valid alignment lock');
    f.faces([]);
    f.strip().props.onOverrideNoise(); f.render(); assert.equal(f.locks(), 0, 'override cannot resurrect the broken face lock');
    for (let i = 0; i < 40; i++) f.faces([{ bounds }]);
    assert.equal(f.locks(), 1);
  } finally { f.unmount(); }
});

test('same-render final good frame, face loss and noise override cannot release a stale lock', () => {
  const f = cameraFixture(834, 1194, 'noisy');
  try {
    f.layout(834, 1194);
    const bounds = idealFace(834, 1194);
    for (let i = 0; i < 39; i++) f.faces([{ bounds }]);
    const callback = f.options().onFacesDetected;
    callback([{ bounds }]); callback([]);
    f.strip().props.onOverrideNoise(); f.render();
    assert.equal(f.locks(), 0);
    f.faces([]);
    for (let i = 0; i < 40; i++) f.faces([{ bounds }]);
    assert.equal(f.locks(), 1);
  } finally { f.unmount(); }
});

test('repeated missing/malformed native callbacks fail closed through diagnostic logging cadence', () => {
  const f = cameraFixture();
  try {
    f.layout(834, 1194);
    for (const faces of [null, undefined, [], [{}], [null], [{ bounds: {} }]]) {
      for (let i = 0; i < 15; i++) f.faces(faces);
      assert.equal(f.locks(), 0);
    }
  } finally { f.unmount(); }
});

test('resizing after manual or auto readiness revokes parent readiness and requires a fresh full lock', () => {
  for (const autoStart of [false, true]) {
    const state = { autoStart, phase: 'cameraCheck', ready: false }, f = cameraFixture();
    let invalidations = 0;
    try {
      const parentLocked = appFlowCameraHandler('onLocked', state);
      const parentInvalidated = appFlowCameraHandler('onAlignmentInvalidated', state);
      const originalLocked = f.props.onLocked;
      f.props.onLocked = () => { originalLocked(); parentLocked(); };
      f.props.onAlignmentInvalidated = () => { invalidations++; parentInvalidated(); };
      f.render(); f.layout(834, 1194);
      for (let i = 0; i < 40; i++) f.faces([{ bounds: idealFace(834, 1194) }]);
      assert.equal(state.ready, true); assert.equal(state.phase, autoStart ? 'countdown' : 'cameraCheck');
      f.layout(834, 1194, 20, 44);
      assert.equal(invalidations, 0, 'same-sized layout or parent offset cannot revoke a local coordinate lock');
      f.layout(1024, 1366);
      assert.equal(invalidations, 1); assert.equal(state.ready, false); assert.equal(state.phase, 'cameraCheck');
      assert.equal(f.guide().props.visible, true);
      assert.equal(f.camera().props.outputs.length, 2, 'full detection resumes after a previously advanced lock');
      for (let i = 0; i < 39; i++) f.faces([{ bounds: idealFace(1024, 1366) }]);
      assert.equal(state.ready, false); assert.equal(f.locks(), 1);
      f.faces([{ bounds: idealFace(1024, 1366) }]);
      assert.equal(state.ready, true); assert.equal(f.locks(), 2);
      assert.equal(state.phase, autoStart ? 'countdown' : 'cameraCheck');
    } finally { f.unmount(); }
  }
});

test('actual recording resize does not interrupt the camera or invalidate parent state', () => {
  const state = { autoStart: false, phase: 'cameraCheck', ready: false }, f = cameraFixture();
  let invalidations = 0;
  try {
    const parentLocked = appFlowCameraHandler('onLocked', state);
    const parentInvalidated = appFlowCameraHandler('onAlignmentInvalidated', state);
    f.props.onLocked = parentLocked;
    f.props.onAlignmentInvalidated = () => { invalidations++; parentInvalidated(); };
    f.render(); f.layout(834, 1194);
    for (let i = 0; i < 40; i++) f.faces([{ bounds: idealFace(834, 1194) }]);
    assert.equal(state.ready, true);
    state.phase = 'recording'; f.props.recordingActive = true; f.render();
    f.layout(1024, 1366);
    assert.equal(state.phase, 'recording'); assert.equal(state.ready, true); assert.equal(invalidations, 0);
    assert.equal(f.camera().props.isActive, true); assert.equal(f.camera().props.outputs.length, 1);
    assert.equal(f.guide().props.visible, false);
  } finally { f.unmount(); }
});

test('parent alignment invalidation affects only readiness and countdown screens', () => {
  for (const phase of ['cameraCheck', 'countdown', 'rehearse', 'brief', 'recording', 'reviewTrim']) {
    const state = { phase, autoStart: true, ready: true };
    appFlowCameraHandler('onAlignmentInvalidated', state)();
    const invalidate = phase === 'cameraCheck' || phase === 'countdown';
    assert.equal(state.phase, invalidate ? 'cameraCheck' : phase);
    assert.equal(state.ready, !invalidate);
  }
});

