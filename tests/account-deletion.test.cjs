const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');

// Real disposable files, with only the Expo adapter replaced. No phone,
// production API, cloud account, or real recording is touched by these tests.
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'insight-deletion-files-'));
  const toPath = value => value?.uri ? toPath(value.uri) : String(value).replace(/^file:\/\//, '');
  class File {
    constructor(...parts) { this.path = path.join(...parts.map(toPath)); this.uri = `file://${this.path}`; }
    get exists() { return fs.existsSync(this.path); }
    get size() { return fs.statSync(this.path).size; }
    get md5() { return require('node:crypto').createHash('md5').update(fs.readFileSync(this.path)).digest('hex'); }
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
  }
  class ApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
  let active = 'test-token-alice', generation = 0, logouts = 0;
  const secureData = new Map([['auth_token', active]]);
  const receipt = token => ({deletion:{status:'pending',requested_at:'2026-11-16T00:00:00.000Z',distributor_id:(token??active??'test-token-alice').replace('test-token-',''),client_id:'client'}});
  const api = { ApiError, setAuthToken: token=>{active=token;generation++;},captureAuthSession:()=>({token:active,generation}),authSessionIsCurrent:s=>s.token===active&&s.generation===generation,
    apiDelete: async (_p,_b,token) => receipt(token), apiGet: async (_p,token) => receipt(token),
    apiGetWithToken: async (p,token)=>p==='/me'?{auth:{distributor_id:token.replace('test-token-',''),client_id:'client'}}:api.apiGet(p,token),
    apiDeleteWithToken: (...args)=>api.apiDelete(...args), apiPostWithToken: async()=>{throw Error('Unexpected login');} };
  const secure = {getItemAsync:async key=>secureData.get(key)??null,setItemAsync:async(key,value)=>{secureData.set(key,value);},deleteItemAsync:async key=>{if(key==='auth_token')logouts++;secureData.delete(key);}};
  const cache = {};
  function load(file) {
    if (cache[file]) return cache[file];
    const source = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', source)(id => {
      if (id === 'expo-file-system') return { File, Directory, Paths: { document: new Directory(dir), cache: new Directory(dir, 'cache') } };
      if (id === './api') return api;
      if (id === 'expo-secure-store') return secure;
      if (id === './auth') return load('auth.ts');
      if (id === './legalDocuments') return { POLICY_VERSION: 'test-policy' };
      if (id === './questions' && file === 'upload.ts') return { fetchQuestions: async () => [{ id: 'synthetic-question', index: 1, text: 'Synthetic question', updated_at: '2026-11-11' }] };
      if (id === './i18n/useStrings') return { t: key => key };
      if (id.startsWith('./')) return load(id.slice(2) + '.ts');
      throw new Error('Unexpected dependency: ' + id);
    }, module, module.exports);
    cache[file] = module.exports;
    return module.exports;
  }
  const write = (name, value) => { const file = new File(dir, name); file.create(); file.write(value); return file; };
  return { dir, File, Directory, api, secure, secureData, load, write, restart: () => { for (const key of Object.keys(cache)) delete cache[key]; }, logouts: () => logouts, clean: () => fs.rmSync(dir, { recursive: true, force: true }) };
}
const state = { screen: 'main', mainTab: 'home', questionIndex: 0, phase: 'brief', retakeQuestionIndex: null, videos: [], takesByQuestion: {}, selectedTakeId: null, autoStart: true, hasSubmittedBatch: false, uploadConfirmed: false, uploadedQuestionIndices: [] };

test('sessions, questions and recordings stay with their own account across switches', () => {
  const f = fixture(); try {
    const scope = f.load('accountStorage.ts'), session = f.load('session.ts'), questions = f.load('questions.ts');
    scope.activateAccount('alice'); session.saveSession({ ...state, mainTab: 'myVideos' }); questions.cacheQuestions([{ id: 'alice-question' }]);
    scope.activateAccount('bob'); assert.equal(session.loadSession(), null); assert.equal(questions.getCachedQuestions(), null);
    session.saveSession(state); questions.cacheQuestions([{ id: 'bob-question' }]);
    scope.activateAccount('alice'); assert.equal(session.loadSession().mainTab, 'myVideos'); assert.equal(questions.getCachedQuestions()[0].id, 'alice-question');
    scope.activateAccount(null); session.saveSession(state); scope.activateAccount('alice'); assert.equal(session.loadSession().mainTab, 'myVideos');
  } finally { f.clean(); }
});

test('legacy unowned data is preserved and never adopted by a new login', async () => {
  const f = fixture(); try {
    f.write('session-state.json', JSON.stringify({ ...state, version: 1 })); f.write('recordings/legacy.mp4', 'private legacy media');
    const scope = f.load('accountStorage.ts'); scope.activateAccount('alice');
    assert.equal(f.load('session.ts').loadSession(), null);
    await scope.removeAccountDirectory('alice'); assert.ok(fs.existsSync(path.join(f.dir, 'recordings/legacy.mp4')));
  } finally { f.clean(); }
});

test('recording deletion refuses sibling accounts, traversal and arbitrary files', () => {
  const f = fixture(); try {
    const scope = f.load('accountStorage.ts'); scope.activateAccount('alice');
    const prefix = scope.accountDirectory('alice').uri + '/recordings/';
    assert.equal(scope.ownsRecording(prefix + 'question-1.mp4'), true);
    for (const uri of [prefix + '../secret.mp4', prefix + '%2e%2e%2fsecret.mp4', prefix + '../../bob/recordings/x.mp4', scope.accountDirectory('bob').uri + '/recordings/x.mp4']) assert.equal(scope.ownsRecording(uri), false);
    assert.throws(() => f.load('recordings.ts').deleteRecording(scope.accountDirectory('bob').uri + '/recordings/x.mp4'));
  } finally { f.clean(); }
});

test('accepted deletion removes only that account, its consent and custom prompts', async () => {
  const f = fixture(); try {
    const scope = f.load('accountStorage.ts'); scope.activateAccount('alice');
    f.write('accounts/alice/recordings/one.mp4', 'alice'); f.write('accounts/bob/recordings/two.mp4', 'bob');
    f.write('consent-state.json', JSON.stringify([{ distributorId: 'alice' }, { distributorId: 'bob' }]));
    f.write('question-prompts.json', JSON.stringify({ version: 1, entries: { '["alice","q","en"]': { custom: ['alice private'] }, '["bob","q","en"]': { custom: ['bob private'] } } }));
    const deletion = f.load('accountDeletion.ts'); await deletion.requestAccountDeletion('test password'); await deletion.finishLocalAccountDeletion();
    assert.equal(fs.existsSync(path.join(f.dir, 'accounts/alice')), false); assert.ok(fs.existsSync(path.join(f.dir, 'accounts/bob/recordings/two.mp4')));
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, 'consent-state.json'))), [{ distributorId: 'bob' }]);
    assert.equal(fs.readFileSync(path.join(f.dir, 'question-prompts.json'), 'utf8').includes('alice'), false);
    assert.equal(deletion.pendingAccountDeletion(), null); assert.equal(f.logouts(), 1); assert.equal(scope.currentAccount(), null);
  } finally { f.clean(); }
});

test('wrong-password rejection never removes local data or leaves a pending deletion', async () => {
  const f = fixture(); try {
    f.load('accountStorage.ts').activateAccount('alice'); f.write('accounts/alice/recordings/one.mp4', 'keep');
    f.api.apiDelete = async () => { throw new f.api.ApiError(401, 'incorrect_password'); };
    const deletion = f.load('accountDeletion.ts'); await assert.rejects(deletion.requestAccountDeletion('wrong'));
    assert.equal(deletion.pendingAccountDeletion(), null); assert.ok(fs.existsSync(path.join(f.dir, 'accounts/alice/recordings/one.mp4'))); assert.equal(f.logouts(), 0);
  } finally { f.clean(); }
});

test('a lost response is recovered from the server receipt after a simulated app restart', async () => {
  const f = fixture(); try {
    f.load('accountStorage.ts').activateAccount('alice'); f.write('accounts/alice/recordings/one.mp4', 'test');
    f.api.apiDelete = async () => { throw new f.api.ApiError(0, 'network_error'); };
    const deletion = f.load('accountDeletion.ts'); await assert.rejects(deletion.requestAccountDeletion('password')); assert.equal(deletion.pendingAccountDeletion().accepted, false);
    assert.equal(await deletion.recoverAccountDeletion(), 'accepted'); assert.equal(fs.existsSync(path.join(f.dir, 'accounts/alice')), false);
  } finally { f.clean(); }
});

test('a request never received by the server preserves recordings when recovery returns not requested', async () => {
  const f = fixture(); try {
    f.load('accountStorage.ts').activateAccount('alice'); f.write('accounts/alice/recordings/one.mp4', 'keep');
    f.api.apiDelete = async () => { throw new f.api.ApiError(0, 'network_error'); };
    const deletion = f.load('accountDeletion.ts'); await assert.rejects(deletion.requestAccountDeletion('password'));
    f.api.apiGet = async () => { throw new f.api.ApiError(404, 'deletion_not_requested'); };
    assert.equal(await deletion.recoverAccountDeletion(), 'none'); assert.ok(fs.existsSync(path.join(f.dir, 'accounts/alice/recordings/one.mp4')));
  } finally { f.clean(); }
});

test('cleanup failures leave an accepted receipt for safe retry', async () => {
  const f = fixture(); try {
    f.load('accountStorage.ts').activateAccount('alice'); f.write('consent-state.json', 'malformed');
    const deletion = f.load('accountDeletion.ts'); await deletion.requestAccountDeletion('password'); await assert.rejects(deletion.finishLocalAccountDeletion());
    assert.equal(deletion.pendingAccountDeletion().accepted, true); f.write('consent-state.json', '[]');
    assert.equal(await deletion.recoverAccountDeletion(), 'accepted'); assert.equal(deletion.pendingAccountDeletion(), null);
  } finally { f.clean(); }
});

test('local cleanup waits for an in-flight native transfer before deleting its files', async () => {
  const f = fixture(); try {
    const scope = f.load('accountStorage.ts'); scope.activateAccount('alice'); f.write('accounts/alice/recordings/one.mp4', 'test');
    let finish; scope.trackAccountTask('alice', new Promise(resolve => { finish = resolve; })); scope.activateAccount(null);
    let cleaned = false; const task = scope.removeAccountDirectory('alice').then(() => { cleaned = true; });
    await Promise.resolve(); assert.equal(cleaned, false); finish(); await task; assert.equal(cleaned, true);
  } finally { f.clean(); }
});

test('account change while PUT is running prevents confirmation with another account token', async () => {
  const f = require('./helpers/appflow-upload.cjs').fixture(); try {
    const upload = f.load('upload.ts'); const take = f.take('account-switch-native-put'); let puts = 0, confirms = 0;
    const batch = await f.ctx.createApprovedBatch([take], f.ctx.questions, upload.readUploadFileIdentity, {ownerId:f.OWNER,clientId:f.CLIENT});
    const entry = batch.entries[0];
    f.api.apiGet = async () => ({contract_version:2,intake_enabled:true,immutable_attempts:true,sha256:true,write_once:true,selected_playback:true,legacy_writes_allowed:false,limits:{source_size_bytes:268435456,duration_ms:180000}});
    f.api.apiPost = async endpoint => {
      if (endpoint.endsWith('/confirm')) { confirms++; throw new f.api.ApiError(404,'video_not_found'); }
      return {contract_version:2,attempt_id:f.ATTEMPT,state:'awaiting_upload',intent:entry.intent,receipt:null,upload:{upload_url:'https://synthetic.invalid/source',expires_at:new Date(Date.now()+300000).toISOString(),required_headers:{'Content-Type':'video/mp4','Content-Length':String(entry.file.sizeBytes),'If-None-Match':'*','x-amz-checksum-sha256':Buffer.from(entry.file.sha256,'hex').toString('base64')}}};
    };
    f.File.prototype.upload = async () => { puts++; f.ctx.activateAccount('bob'); return {status:200}; };
    await assert.rejects(upload.uploadSegment(entry, undefined, () => {}), /Account changed/);
    assert.equal(puts,1,'exercise actual native PUT adapter');
    assert.equal(confirms,1,'only the missing-object preflight; never confirmation with the new identity');
    assert.ok(new f.File(take.filePath).exists);
  } finally { f.clean(); }
});

test('switching accounts aborts the previous native transfer signal', () => {
  const f = fixture(); try {
    const scope = f.load('accountStorage.ts'); scope.activateAccount('alice'); const previous = scope.accountScope();
    scope.activateAccount('bob'); assert.equal(previous.signal.aborted, true); assert.equal(scope.accountScope().signal.aborted, false);
  } finally { f.clean(); }
});

test('an old account response cannot expire a newer login; current deletion rejection is reported', async () => {
  const f = fixture(); const previousFetch = global.fetch; const previousBase = process.env.EXPO_PUBLIC_API_BASE_URL;
  process.env.EXPO_PUBLIC_API_BASE_URL = 'http://example.invalid';
  try {
    const api = f.load('api.ts'); let release; const reasons = [];
    api.setSessionExpiredHandler(code => reasons.push(code)); api.setAuthToken('old-test-token');
    global.fetch = () => new Promise(resolve => { release = resolve; });
    const pending = api.apiGet('/me'); api.setAuthToken('new-test-token');
    release({ ok: false, status: 401, text: async () => JSON.stringify({ error: 'account_deleted' }) });
    await assert.rejects(pending); assert.deepEqual(reasons, []);
    global.fetch = async () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: 'account_deleted' }) });
    await assert.rejects(api.apiGet('/me')); assert.deepEqual(reasons, ['account_deleted']);
  } finally {
    global.fetch = previousFetch; if (previousBase === undefined) delete process.env.EXPO_PUBLIC_API_BASE_URL; else process.env.EXPO_PUBLIC_API_BASE_URL = previousBase;
    f.clean();
  }
});


const deferred = () => { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve=>setImmediate(resolve));
const ownReceipt = owner => ({deletion:{status:'completed',requested_at:'2026-11-16T00:00:00.000Z',distributor_id:owner,client_id:'client'}});

test('late accepted A deletion leaves B login, drafts, consent and persisted progress intact', async()=>{
 const f=fixture();try{
  const scope=f.load('accountStorage.ts'),deletion=f.load('accountDeletion.ts'),auth=f.load('auth.ts'),session=f.load('session.ts');scope.activateAccount('alice');
  f.write('accounts/alice/recordings/one.mp4','A');f.write('accounts/bob/recordings/two.mp4','B');
  f.write('consent-state.json',JSON.stringify([{distributorId:'alice'},{distributorId:'bob'}]));
  const held=deferred(),entered=deferred();f.api.apiDelete=async()=>{entered.resolve();return held.promise;};
  const pending=deletion.requestAccountDeletion('disposable');await entered.promise;
  await auth.logout();f.api.apiPost=async()=>({token:'test-token-bob'});await auth.loginByPhone('9999999999','disposable');scope.activateAccount('bob');session.saveSession({...state,mainTab:'myVideos'});
  const before=f.api.captureAuthSession(),manifest=fs.readFileSync(path.join(f.dir,'accounts/bob/session-state.json'),'utf8');
  held.resolve(ownReceipt('alice'));await pending;await deletion.finishLocalAccountDeletion('alice');
  assert.deepEqual(f.api.captureAuthSession(),before);assert.equal(f.secureData.get('auth_token'),'test-token-bob');assert.equal(scope.currentAccount(),'bob');
  assert.equal(fs.readFileSync(path.join(f.dir,'accounts/bob/session-state.json'),'utf8'),manifest);assert.equal(fs.readFileSync(path.join(f.dir,'accounts/bob/recordings/two.mp4'),'utf8'),'B');
  assert.equal(fs.existsSync(path.join(f.dir,'accounts/alice')),false);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir,'consent-state.json'))),[{distributorId:'bob'}]);
 }finally{f.clean();}
});

test('expired dedicated proof recovers an accepted deletion after restart without replacing B auth',async()=>{
 const f=fixture();try{
  f.load('accountStorage.ts').activateAccount('alice');f.write('accounts/alice/recordings/one.mp4','A');f.write('accounts/bob/recordings/two.mp4','B');
  f.api.apiDelete=async()=>{throw new f.api.ApiError(0,'network_error');};await assert.rejects(f.load('accountDeletion.ts').requestAccountDeletion('disposable'));
  await f.load('auth.ts').logout();f.api.setAuthToken('test-token-bob');f.secureData.set('auth_token','test-token-bob');f.restart();
  const scope=f.load('accountStorage.ts');scope.activateAccount('bob');const before=f.api.captureAuthSession();
  f.api.apiGet=async(_path,token)=>{assert.equal(token,'test-token-alice');return ownReceipt('alice');};
  assert.equal(await f.load('accountDeletion.ts').recoverAccountDeletion('alice'),'accepted');assert.deepEqual(f.api.captureAuthSession(),before);assert.equal(scope.currentAccount(),'bob');
  assert.ok(fs.existsSync(path.join(f.dir,'accounts/bob/recordings/two.mp4')));assert.equal(fs.existsSync(path.join(f.dir,'accounts/alice')),false);
  assert.deepEqual([...f.secureData.keys()],['auth_token']);
 }finally{f.clean();}
});

test('expired unaccepted intent requires same-owner reauthentication and preserves drafts on 404',async()=>{
 const f=fixture();try{
  const scope=f.load('accountStorage.ts'),deletion=f.load('accountDeletion.ts');scope.activateAccount('alice');f.write('accounts/alice/recordings/one.mp4','keep');
  await deletion.rememberAccountDeletion('alice','test-token-alice');await f.load('auth.ts').logout();
  f.api.apiGet=async()=>{throw new f.api.ApiError(401,'token_expired');};await assert.rejects(deletion.recoverAccountDeletion('alice'),e=>e.needsSignIn===true);assert.ok(deletion.pendingAccountDeletion('alice'));
  f.api.apiPostWithToken=async()=>({token:'test-token-bob'});
  await assert.rejects(deletion.reauthenticateAccountDeletion('alice','9999999999','disposable','IN'),/whose deletion/);assert.ok(deletion.pendingAccountDeletion('alice'));assert.equal(f.api.captureAuthSession().token,null);
  f.api.apiPostWithToken=async()=>({token:'test-token-alice'});f.api.apiGet=async()=>{throw new f.api.ApiError(404,'deletion_not_requested');};
  const result=await deletion.reauthenticateAccountDeletion('alice','9999999999','disposable','IN');assert.equal(result.result,'none');assert.ok(deletion.pendingAccountDeletion('alice'),'retain proof for a server request that may still accept later');assert.ok(fs.existsSync(path.join(f.dir,'accounts/alice/recordings/one.mp4')));assert.equal(f.api.captureAuthSession().token,null,'isolated sign-in never commits global credentials');
 }finally{f.clean();}
});

test('mismatched receipt and missing proof preserve quarantined drafts and let B retain a separate intent',async()=>{
 const f=fixture();try{
  const deletion=f.load('accountDeletion.ts');f.write('accounts/alice/recordings/one.mp4','keep');
  await deletion.rememberAccountDeletion('alice','test-token-alice');await deletion.rememberAccountDeletion('bob','test-token-bob');
  f.api.apiGet=async()=>ownReceipt('bob');await assert.rejects(deletion.recoverAccountDeletion('alice'));assert.ok(deletion.pendingAccountDeletion('alice'));assert.ok(deletion.pendingAccountDeletion('bob'));assert.ok(fs.existsSync(path.join(f.dir,'accounts/alice/recordings/one.mp4')));
  f.secureData.clear();await assert.rejects(deletion.recoverAccountDeletion('alice'),e=>e.needsSignIn===true);assert.ok(deletion.pendingAccountDeletion('alice'));
 }finally{f.clean();}
});

test('held native cleanup of A preserves B journal written during SecureStore await',async()=>{
 const f=fixture();try{
  const scope=f.load('accountStorage.ts'),deletion=f.load('accountDeletion.ts');scope.activateAccount('alice');f.write('accounts/alice/recordings/one.mp4','A');
  await deletion.requestAccountDeletion('disposable');const native=deferred();scope.trackAccountTask('alice',native.promise);
  const pending=deletion.finishLocalAccountDeletion('alice');await tick();scope.activateAccount('bob');f.api.setAuthToken('test-token-bob');f.secureData.set('auth_token','test-token-bob');
  await deletion.rememberAccountDeletion('bob','test-token-bob');native.resolve();await pending;
  assert.ok(deletion.pendingAccountDeletion('bob'));assert.equal(deletion.pendingAccountDeletion('alice'),null);assert.equal(scope.currentAccount(),'bob');assert.equal(f.secureData.get('auth_token'),'test-token-bob');
 }finally{f.clean();}
});

test('legacy intent migrates without claiming B token or erasing A on a foreign 404',async()=>{
 const f=fixture();try{
  f.write('account-deletion-pending.json',JSON.stringify({owner:'alice',accepted:false}));f.write('accounts/alice/recordings/one.mp4','keep');f.api.setAuthToken('test-token-bob');f.secureData.set('auth_token','test-token-bob');
  f.api.apiGet=async()=>{throw new f.api.ApiError(404,'deletion_not_requested');};const deletion=f.load('accountDeletion.ts');
  await assert.rejects(deletion.recoverAccountDeletion('alice'),e=>e.needsSignIn===true);assert.ok(deletion.pendingAccountDeletion('alice'));assert.ok(fs.existsSync(path.join(f.dir,'accounts/alice/recordings/one.mp4')));
  await deletion.rememberAccountDeletion('bob','test-token-bob');const journal=fs.readFileSync(path.join(f.dir,'account-deletion-pending.json'),'utf8');assert.equal(JSON.parse(journal).version,2);assert.equal(journal.includes('test-token'),false);
 }finally{f.clean();}
});

test('slow native auth deletion is serialized before a new B login token write',async()=>{
 const f=fixture();try{
  const auth=f.load('auth.ts'),original=f.secure.deleteItemAsync,held=deferred(),entered=deferred();
  f.secure.deleteItemAsync=async key=>{if(key==='auth_token'){entered.resolve();await held.promise;}await original(key);};
  const pending=auth.logoutIfSession(f.api.captureAuthSession());await entered.promise;
  f.api.apiPost=async()=>({token:'test-token-bob'});const login=auth.loginByPhone('9999999999','disposable');held.resolve();await pending;await login;
  assert.equal(f.secureData.get('auth_token'),'test-token-bob');assert.equal(f.api.captureAuthSession().token,'test-token-bob');
 }finally{f.clean();}
});

test('isolated expiry and same-token old-generation failures cannot expire the current login',async()=>{
 const f=fixture(),saved=global.fetch,base=process.env.EXPO_PUBLIC_API_BASE_URL;process.env.EXPO_PUBLIC_API_BASE_URL='https://synthetic.invalid';try{
  const api=f.load('api.ts'),reasons=[];api.setAuthToken('same-token');api.setSessionExpiredHandler(c=>reasons.push(c));const held=deferred();global.fetch=()=>held.promise;
  const request=api.apiGet('/me');api.setAuthToken('same-token');held.resolve({ok:false,status:401,text:async()=>JSON.stringify({error:'account_deleted'})});await assert.rejects(request);assert.deepEqual(reasons,[]);
  global.fetch=async()=>({ok:false,status:401,text:async()=>JSON.stringify({error:'token_expired'})});await assert.rejects(api.apiGetWithToken('/distributors/me/deletion','expired-A'));assert.deepEqual(reasons,[]);assert.equal(api.captureAuthSession().token,'same-token');
 }finally{global.fetch=saved;if(base===undefined)delete process.env.EXPO_PUBLIC_API_BASE_URL;else process.env.EXPO_PUBLIC_API_BASE_URL=base;f.clean();}
});

test('a 404 snapshot after restart retains proof for a later accepted server response',async()=>{
 const f=fixture();try{
  const scope=f.load('accountStorage.ts');scope.activateAccount('alice');f.write('accounts/alice/recordings/one.mp4','keep until receipt');
  f.api.apiDelete=async()=>{throw new f.api.ApiError(0,'network_error');};await assert.rejects(f.load('accountDeletion.ts').requestAccountDeletion('disposable'));f.restart();
  const deletion=f.load('accountDeletion.ts');f.api.apiGet=async()=>{throw new f.api.ApiError(404,'deletion_not_requested');};assert.equal(await deletion.recoverAccountDeletion('alice'),'none');assert.ok(deletion.pendingAccountDeletion('alice'));
  f.api.apiGet=async()=>ownReceipt('alice');assert.equal(await deletion.recoverAccountDeletion('alice'),'accepted');assert.equal(fs.existsSync(path.join(f.dir,'accounts/alice')),false);assert.equal(deletion.pendingAccountDeletion('alice'),null);
 }finally{f.clean();}
});

test('isolated recovery request times out without changing the active account',async()=>{
 const f=fixture(),oldFetch=global.fetch,oldTimer=global.setTimeout,base=process.env.EXPO_PUBLIC_API_BASE_URL;process.env.EXPO_PUBLIC_API_BASE_URL='https://synthetic.invalid';try{
  const api=f.load('api.ts'),reasons=[];api.setAuthToken('B');api.setSessionExpiredHandler(c=>reasons.push(c));
  global.setTimeout=(fn,ms,...args)=>oldTimer(fn,ms===20000?1:ms,...args);
  global.fetch=(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(Error('synthetic timeout')),{once:true}));
  await assert.rejects(api.apiGetWithToken('/distributors/me/deletion','A'),e=>e.code==='network_error');assert.equal(api.captureAuthSession().token,'B');assert.deepEqual(reasons,[]);
 }finally{global.fetch=oldFetch;global.setTimeout=oldTimer;if(base===undefined)delete process.env.EXPO_PUBLIC_API_BASE_URL;else process.env.EXPO_PUBLIC_API_BASE_URL=base;f.clean();}
});

test('parallel owner-specific requests and slow A proof deletion preserve B accepted journal',async()=>{
 const f=fixture();try{
  const scope=f.load('accountStorage.ts'),deletion=f.load('accountDeletion.ts');scope.activateAccount('alice');f.write('accounts/alice/recordings/one.mp4','A');f.write('accounts/bob/recordings/two.mp4','B');
  const held=deferred(),entered=deferred();f.api.apiDelete=async(_p,_body,token)=>{if(token==='test-token-alice'){entered.resolve();return held.promise;}return ownReceipt('bob');};
  const a=deletion.requestAccountDeletion('disposable');await entered.promise;scope.activateAccount('bob');f.api.setAuthToken('test-token-bob');f.secureData.set('auth_token','test-token-bob');await deletion.requestAccountDeletion('disposable');held.resolve(ownReceipt('alice'));await a;
  const proofHeld=deferred(),proofEntered=deferred(),remove=f.secure.deleteItemAsync;f.secure.deleteItemAsync=async key=>{if(key.startsWith('account_deletion_alice_')){proofEntered.resolve();await proofHeld.promise;}await remove(key);};
  const cleanA=deletion.finishLocalAccountDeletion('alice');await proofEntered.promise;await deletion.rememberAccountDeletion('bob','test-token-bob');proofHeld.resolve();await cleanA;
  assert.equal(deletion.pendingAccountDeletion('alice'),null);assert.equal(deletion.pendingAccountDeletion('bob').accepted,true);assert.equal(scope.currentAccount(),'bob');assert.equal(f.secureData.get('auth_token'),'test-token-bob');assert.equal(fs.readFileSync(path.join(f.dir,'accounts/bob/recordings/two.mp4'),'utf8'),'B');
 }finally{f.clean();}
});

test('native secure-store failure retains accepted journal for retry and preserves B credentials',async()=>{
 const f=fixture();try{
  const scope=f.load('accountStorage.ts'),deletion=f.load('accountDeletion.ts');scope.activateAccount('alice');await deletion.requestAccountDeletion('disposable');scope.activateAccount('bob');f.api.setAuthToken('test-token-bob');f.secureData.set('auth_token','test-token-bob');
  const remove=f.secure.deleteItemAsync;f.secure.deleteItemAsync=async key=>{if(key.startsWith('account_deletion_'))throw Error('disposable native storage error');return remove(key);};
  await assert.rejects(deletion.finishLocalAccountDeletion('alice'));assert.equal(deletion.pendingAccountDeletion('alice').accepted,true);assert.equal(f.api.captureAuthSession().token,'test-token-bob');assert.equal(f.secureData.get('auth_token'),'test-token-bob');
  f.secure.deleteItemAsync=remove;assert.equal(await deletion.recoverAccountDeletion('alice'),'accepted');assert.equal(deletion.pendingAccountDeletion('alice'),null);assert.equal(scope.currentAccount(),'bob');
 }finally{f.clean();}
});
