const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const path=require('node:path');
function fixture(error){let stored='stored-token',active=null,deletes=0,generation=0;class ApiError extends Error{constructor(code){super(code);this.code=code;}}
 const api={ApiError,setAuthToken:t=>{active=t;generation++;},captureAuthSession:()=>({token:active,generation}),authSessionIsCurrent:s=>s.token===active&&s.generation===generation,apiGet:async()=>{if(error)throw new ApiError(error);return {auth:{distributor_id:'owner-a',client_id:'client-a'}};}};
 const secure={getItemAsync:async()=>stored,setItemAsync:async(_,v)=>stored=v,deleteItemAsync:async()=>{deletes++;stored=null;}};
 const m={exports:{}};const js=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../auth.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('require','module','exports',js)(id=>id==='./api'?api:secure,m,m.exports);return {auth:m.exports,api,secure,get stored(){return stored;},get active(){return active;},get deletes(){return deletes;}};
}
for(const code of ['network_error','internal_server_error'])test(`startup preserves token and account ownership after ${code}`,async()=>{const f=fixture(code);await assert.rejects(f.auth.restoreSession());assert.equal(f.stored,'stored-token');assert.equal(f.deletes,0);});
for(const code of ['token_expired','invalid_token','account_deleted'])test(`startup rejects confirmed ${code}`,async()=>{const f=fixture(code);assert.equal(await f.auth.restoreSession(),null);assert.equal(f.stored,null);assert.equal(f.active,null);});
test('successful restoration verifies identity with backend',async()=>{const f=fixture();assert.deepEqual(await f.auth.restoreSession(),{distributorId:'owner-a',clientId:'client-a'});});

test('delayed native startup token read cannot replace a newly committed B login',async()=>{
 const f=fixture();let release;f.secure.getItemAsync=()=>new Promise(resolve=>{release=resolve;});
 const restoring=f.auth.restoreSession();await new Promise(resolve=>setImmediate(resolve));
 f.api.apiPost=async()=>({token:'new-B-token'});await f.auth.loginByPhone('9999999999','disposable');
 release('old-A-token');assert.equal(await restoring,null);assert.equal(f.active,'new-B-token');assert.equal(f.stored,'new-B-token');assert.equal(f.deletes,0);
});
