// Executes the checked-in AppFlow handlers/effects, not a reimplementation.
// React rendering/native adapters are replaced; each invocation captures a
// render's state while asynchronous callbacks and refs retain their identity.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../..');
const OWNER = '10000000-0000-4000-8000-000000000001';
const CLIENT = '20000000-0000-4000-8000-000000000001';
const ATTEMPT = '30000000-0000-4000-8000-000000000001';
const SEGMENT = '40000000-0000-4000-8000-000000000001';
const english = require('../../i18n/strings.en.json');
const strings = key => key.split('.').reduce((value, part) => value?.[part], english) ?? key;
const source = ts.createSourceFile('AppFlow.tsx', fs.readFileSync(path.join(root, 'AppFlow.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const component = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'AppFlow');
assert.ok(component, 'AppFlow component remains available for source execution');
const functions = component.body.statements.filter(ts.isFunctionDeclaration).map(n => n.getText(source)).join('\n');
const renderAssignments = component.body.statements.filter(n => ts.isExpressionStatement(n) && ts.isBinaryExpression(n.expression) && n.expression.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.expression.left) && n.expression.left.name.text === 'current').map(n => n.getText(source)).join('\n');
const effects = component.body.statements.filter(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(source) === 'useEffect').map(n => n.expression);
const declarations = component.body.statements.filter(ts.isVariableStatement).flatMap(n => [...n.declarationList.declarations]);
const compile = text => ts.transpileModule(text, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;

function fixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-upload-approval-'));
  const toPath = value => value?.uri ? toPath(value.uri) : String(value).replace(/^file:\/\//, '');
  class File {
    constructor(...parts) { this.path = path.join(...parts.map(toPath)); this.uri = `file://${this.path}`; }
    get exists() { return fs.existsSync(this.path); }
    get name() { return path.basename(this.path); }
    get size() { return fs.statSync(this.path).size; }
    open() { const file = this; const fd = fs.openSync(this.path, 'r'); let offset = 0, closed = false; return { get size() { return fs.fstatSync(fd).size; }, get offset() { return offset; }, readBytes(length) { assert.ok(!closed); reads.push(length); const bytes = Buffer.alloc(length); const count = fs.readSync(fd, bytes, 0, length, offset); offset += count; return new Uint8Array(bytes.subarray(0,count)); }, close() { fs.closeSync(fd); closed = true; closedHandles.push(file.uri); } }; }
    get md5() { return require('node:crypto').createHash('md5').update(fs.readFileSync(this.path)).digest('hex'); }
    info() { return { exists: this.exists, size: this.size, md5: this.md5 }; }
    create() { fs.mkdirSync(path.dirname(this.path), { recursive: true }); fs.writeFileSync(this.path, ''); }
    write(value) { fs.writeFileSync(this.path, value); }
    textSync() { return fs.readFileSync(this.path, 'utf8'); }
    delete() { fs.unlinkSync(this.path); }
    moveSync(destination) { fs.mkdirSync(path.dirname(destination.path), { recursive: true }); fs.renameSync(this.path, destination.path); }
  }
  class Directory {
    constructor(...parts) { this.path = path.join(...parts.map(toPath)); this.uri = `file://${this.path}`; }
    get exists() { return fs.existsSync(this.path); }
    create() { fs.mkdirSync(this.path, { recursive: true }); }
    delete() { fs.rmSync(this.path, { recursive: true }); }
    list() { return fs.readdirSync(this.path).map(name => new File(this.path, name)); }
  }
  const cache = {};
  class ApiError extends Error { constructor(status, code) { super(code ?? status); this.status = code ? status : 404; this.code = code ?? status; } }
  const api = { ApiError, apiGet: async () => { throw new Error('Unexpected synthetic GET'); }, apiPost: async () => { throw new Error('Unexpected synthetic API request'); } };
  function load(file) {
    if (cache[file]) return cache[file];
    const module = { exports: {} }; cache[file] = module.exports;
    new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', compile(fs.readFileSync(path.join(root, file), 'utf8')))(id => {
      if (id === 'expo-file-system') return { File, Directory, FileMode: { ReadOnly: 'readOnly' }, Paths: { document: new Directory(dir), cache: new Directory(dir, 'cache') } };
      if (id === 'expo-secure-store' && options.secureStore) return options.secureStore;
      if (id === './i18n/useStrings') return { t: strings };
      if (id === './api') return api;
      if (id === './questions') return { fetchQuestions: async () => structuredClone(ctx.questions) };
      if (id.startsWith('@noble/hashes/')) return require(id);
      if (id.startsWith('./')) return load(id.slice(2) + '.ts');
      throw new Error('Unexpected module dependency: ' + id);
    }, module, module.exports, options.setTimeout ?? setTimeout, options.clearTimeout ?? clearTimeout);
    cache[file] = module.exports; return module.exports;
  }
  const sent = [], removed = [], checkpoints = [], reads = [], closedHandles = [];
  const ctx = vm.createContext({ console, setTimeout, clearTimeout, Date, Error, AbortController, File, __DEV__: false,
    t: strings, getCachedQuestions: () => null, getCurrentAuth: () => null,
    ENABLE_REEL_RENDERING: false, ENABLE_SELF_REGISTRATION: true,
    MAX_TAKES: 3, MAX_KEPT_TAKES: 2,
  });
  for (const file of ['accountStorage.ts', 'recordings.ts', 'session.ts', 'takeDeletion.ts', 'completionFeedback.ts', 'uploadProtocol.ts', 'uploadFileIdentity.ts', 'trim.ts', 'uploadBatch.ts', 'upload.ts', 'answerLibrary.ts']) {
    if (fs.existsSync(path.join(root, file))) Object.assign(ctx, load(file));
  }
  ctx.activateAccount(OWNER);
  const realSave = ctx.saveSession, realDelete = ctx.deleteRecording;
  ctx.saveSession = value => { realSave(value); checkpoints.push(JSON.parse(JSON.stringify(value))); };
  ctx.deleteRecording = file => { removed.push(file); realDelete(file); };
  ctx.requireUploadCapabilities = async () => ({limits:{source_size_bytes:268435456,duration_ms:180000}});
  ctx.uploadSegment = async (entry, signal, persistAttempt) => { sent.push(structuredClone(entry)); persistAttempt({attemptId:ATTEMPT,requiredHeaders:null,expiresAt:null}); return confirmation(entry); };
  for (const decl of declarations) {
    if (!decl.initializer || !ts.isCallExpression(decl.initializer)) continue;
    const name = decl.initializer.expression.getText(source);
    if (name === 'useState' && ts.isArrayBindingPattern(decl.name)) {
      const [valueElement, setterElement] = decl.name.elements;
      const setter = setterElement.name.text;
      const value = valueElement.name?.text ?? setter[3].toLowerCase() + setter.slice(4);
      try { ctx[value] = vm.runInContext(compile('(' + (decl.initializer.arguments[0]?.getText(source) ?? 'undefined') + ')'), ctx); } catch { ctx[value] = null; }
      ctx[setter] = next => { ctx[value] = typeof next === 'function' ? next(ctx[value]) : next; };
    } else if (name === 'useRef' && ts.isIdentifier(decl.name)) {
      let initial = null;
      try { initial = vm.runInContext(compile('(' + (decl.initializer.arguments[0]?.getText(source) ?? 'undefined') + ')'), ctx); } catch {}
      ctx[decl.name.text] = { current: initial };
    }
  }
  Object.assign(ctx, { distributorId: OWNER, clientId: CLIENT, sessionRestored: true, consentAccepted: true, deletionRecovery: null, deletionBusy: false,
    screen: 'main', mainTab: 'home', phase: 'brief', questionIndex: 0, videos: [], takesByQuestion: {}, answerRows: [],
    selectedTakeId: null, keptTakeIds: [], questions: [{ id: '50000000-0000-4000-8000-000000000001', index: 11, text: 'Synthetic first question', updated_at: '2026-11-11T00:00:00.000Z', language:'en' }, { id: '50000000-0000-4000-8000-000000000002', index: 22, text: 'Synthetic second question', updated_at: '2026-11-11T00:00:00.000Z', language:'en' }],
  });
  Object.defineProperty(ctx, 'uploadConfirmed', { enumerable: true, configurable: true, get: () => ctx.approvedBatch !== null });
  Object.defineProperty(ctx, 'uploadedQuestionIndices', { enumerable: true, configurable: true, get: () => ctx.approvedBatch?.entries.filter(entry => entry.confirmation).map(entry => entry.video.questionIndex) ?? [] });
  function invoke(expression) {
    // Capture current values as a React render does, with shared state setters.
    ctx.renderAccountScope = ctx.currentAccount() ? ctx.accountScope() : null;
    if (ctx.captureAuthSession) ctx.renderAuthSession = ctx.captureAuthSession();
    ctx.primaryVideos = ctx.videos.filter(v => v.isPrimary !== false);
    const keys = Object.keys(ctx).filter(key => /^[a-zA-Z_$][\w$]*$/.test(key));
    return vm.runInContext(compile(`(function(${keys.join(',')}) { ${renderAssignments}\n${functions}\nreturn (${expression}); })(${keys.join(',')})`), ctx);
  }
  function captureEffect(needle) {
    const matches = effects.filter(n => n.arguments[0].getText(source).includes(needle));
    assert.equal(matches.length, 1, 'unique production effect: ' + needle);
    return invoke('(' + matches[0].arguments[0].getText(source) + ')');
  }
  function take(id, questionIndex = 0, extra = {}) {
    const file = new File(dir, 'accounts/' + OWNER + '/recordings', id + '.mp4'); file.create(); file.write('synthetic media ' + id);
    return { id, questionIndex, filePath: file.uri, label: `Question ${questionIndex + 1}`, durationSeconds: 12, durationVerified:true, isPrimary: true, questionSnapshot: ctx.snapshotQuestion(ctx.questions[questionIndex]), expectedCurrentSegmentId:null, ...extra };
  }
  function confirmation(entry, segmentId = SEGMENT, attemptId = ATTEMPT) {
    const receipt = {contract_version:2,receipt_id:attemptId,attempt_id:attemptId,distributor_id:entry.ownerId,client_id:entry.clientId,segment_id:segmentId,accepted_at:new Date().toISOString(),intent:structuredClone(entry.intent),verified:{source_sha256:entry.file.sha256,source_size_bytes:entry.file.sizeBytes,source_duration_ms:Math.floor(entry.video.durationSeconds*1000),effective_trim_start_ms:entry.intent.trim_start_ms,effective_trim_end_ms:entry.intent.trim_end_ms??Math.floor(entry.video.durationSeconds*1000),source_identity:{video_key:`clients/${entry.clientId}/distributors/${entry.ownerId}/uploads/${attemptId}/source.mp4`,write_once:true}}};
    return {confirmedAt:receipt.accepted_at,segmentId,receipt};
  }
  function jsxProp(componentName, propName) {
    const matches = [];
    function visit(node) {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText(source) === componentName) {
        const attr = node.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.text === propName);
        if (attr?.initializer && ts.isJsxExpression(attr.initializer)) matches.push(attr.initializer.expression.getText(source));
      }
      ts.forEachChild(node, visit);
    }
    visit(component);
    assert.equal(matches.length, 1, `unique production prop ${componentName}.${propName}`);
    return invoke(matches[0]);
  }
  return { ctx, load, sent, removed, checkpoints, reads, closedHandles, api, confirmation, OWNER, CLIENT, ATTEMPT, SEGMENT, invoke, jsxProp, captureEffect, effect: needle => captureEffect(needle)(), take, File,
    settle: () => new Promise(resolve => setImmediate(resolve)),
    dependencyText: needle => effects.find(n => n.arguments[0].getText(source).includes(needle))?.arguments[1]?.getText(source),
    clean: () => fs.rmSync(dir, { recursive: true, force: true }),
  };
}
module.exports = { fixture };
