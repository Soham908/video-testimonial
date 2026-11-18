const {test}=require('node:test');const assert=require('node:assert/strict');
const {fixture}=require('./helpers/appflow-upload.cjs');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function setup(){
 const data=new Map([['auth_token','token-A']]);const secure={getItemAsync:async k=>data.get(k)??null,setItemAsync:async(k,v)=>{data.set(k,v);},deleteItemAsync:async k=>{data.delete(k);}};
 const f=fixture({secureStore:secure});const api=f.load('api.ts');Object.assign(f.api,api);Object.assign(f.ctx,api,f.load('auth.ts'),f.load('accountDeletion.ts'));
 f.ctx.setAuthToken('token-A');f.ctx.hasConsented=()=>true;f.ctx.fetchDistributorProfile=async()=>({name:'disposable'});f.ctx.fetchQuestions=async()=>f.ctx.questions;f.ctx.cacheQuestions=()=>{};
 const ownerB='10000000-0000-4000-8000-000000000002';
 const response=(body,status=200)=>({ok:status<400,status,text:async()=>JSON.stringify(body)});
 let route=async(url,opts)=>{const token=opts.headers.Authorization; if(url.endsWith('/me'))return response({auth:{distributor_id:token==='Bearer token-B'?ownerB:f.OWNER,client_id:f.CLIENT}});throw Error('Unexpected synthetic route');};
 const old=global.fetch,oldBase=process.env.EXPO_PUBLIC_API_BASE_URL;
 global.fetch=(...args)=>route(...args);
 return{f,data,ownerB,response,setRoute:r=>{route=r;},clean:()=>{global.fetch=old;if(oldBase===undefined)delete process.env.EXPO_PUBLIC_API_BASE_URL;else process.env.EXPO_PUBLIC_API_BASE_URL=oldBase;f.clean();}};
}
// The module's base URL is captured at import; no request ever leaves this process.
process.env.EXPO_PUBLIC_API_BASE_URL='https://disposable.invalid';
for(const outcome of ['accepted','incorrect_password','network_error'])test(`actual AppFlow delayed A ${outcome} cannot reset B or suppress B checkpoints`,async()=>{
 const h=setup(),{f}=h;try{
  const a=f.take('A-original');f.ctx.videos=[a];f.ctx.takesByQuestion={0:[a]};const held=deferred(),entered=deferred();
  h.setRoute(async(url,opts)=>{if(opts.method==='DELETE'){entered.resolve();return held.promise;}return h.response({auth:{distributor_id:f.OWNER,client_id:f.CLIENT}});});
  const pending=f.invoke("handleDeleteAccount('disposable-password')");const caught=pending.catch(e=>e);await entered.promise;
  f.invoke('handleLogout()');await f.settle();
  f.ctx.setAuthToken('token-B');h.data.set('auth_token','token-B');
  h.setRoute(async()=>h.response({auth:{distributor_id:h.ownerB,client_id:f.CLIENT}}));await f.invoke('handleAuthenticated()');await f.settle();
  assert.equal(f.ctx.currentAccount(),h.ownerB);assert.equal(f.ctx.deletionBusy,false);
  const b=new f.File(f.ctx.accountDirectory(h.ownerB),'recordings/B.mp4');b.create();b.write('B unchanged');
  f.ctx.videos=[{...a,id:'B',filePath:b.uri}];f.ctx.takesByQuestion={0:[f.ctx.videos[0]]};f.ctx.mainTab='myVideos';f.ctx.screen='main';
  f.effect('saveSession(');const snapshot=JSON.stringify({videos:f.ctx.videos,takes:f.ctx.takesByQuestion,screen:f.ctx.screen,mainTab:f.ctx.mainTab});const session=f.ctx.loadSession();const auth=f.ctx.captureAuthSession();
  if(outcome==='accepted')held.resolve(h.response({deletion:{status:'pending',requested_at:'2026-11-16T00:00:00.000Z',distributor_id:f.OWNER,client_id:f.CLIENT}},202));
  else if(outcome==='network_error')held.reject(Error('synthetic disconnect'));
  else held.resolve(h.response({error:'incorrect_password'},401));
  await caught;await f.settle();
  assert.equal(f.ctx.currentAccount(),h.ownerB);assert.deepEqual(f.ctx.captureAuthSession(),auth);assert.equal(h.data.get('auth_token'),'token-B');assert.equal(f.ctx.deletionBusy,false);assert.equal(f.ctx.deletionRecovery,null);
  assert.equal(JSON.stringify({videos:f.ctx.videos,takes:f.ctx.takesByQuestion,screen:f.ctx.screen,mainTab:f.ctx.mainTab}),snapshot);assert.deepEqual(f.ctx.loadSession(),session);assert.equal(b.textSync(),'B unchanged');
  if(outcome==='accepted')assert.equal(new f.File(a.filePath).exists,false);else assert.equal(new f.File(a.filePath).exists,true);
 }finally{h.clean();}
});

test('stale profile delete callback refuses to dispatch with a different account session',async()=>{
 const h=setup(),{f}=h;try{const stale=f.invoke('handleDeleteAccount');f.ctx.activateAccount(h.ownerB);f.ctx.setAuthToken('token-B');let calls=0;h.setRoute(async()=>{calls++;throw Error('must not send');});await assert.rejects(stale('disposable'),/account changed/i);assert.equal(calls,0);}finally{h.clean();}
});

test('generic account_deleted without a receipt preserves recordings and exposes recovery instead of wiping',async()=>{
 const h=setup(),{f}=h;try{const a=f.take('not-a-receipt');h.setRoute(async()=>h.response({error:'token_expired'},401));f.invoke("handleSessionExpired('account_deleted')");await f.settle();await f.settle();assert.equal(new f.File(a.filePath).exists,true);assert.ok(f.ctx.pendingAccountDeletion(f.OWNER));assert.equal(f.ctx.deletionRecoveryOwner,f.OWNER);assert.equal(f.ctx.deletionBusy,false);assert.equal(f.ctx.captureAuthSession().token,null);}finally{h.clean();}
});

test('recovery use-another-account callback becomes harmless after B signs in',async()=>{
 const h=setup(),{f}=h;try{await f.ctx.rememberAccountDeletion(f.OWNER,'token-A');f.ctx.deletionRecoveryOwner=f.OWNER;const stale=f.invoke('() => leaveDeletionRecovery(deletionUIVersion.current, deletionRecoveryOwner, renderAuthSession)');
  f.invoke('handleLogout()');await f.settle();f.ctx.setAuthToken('token-B');h.data.set('auth_token','token-B');h.setRoute(async()=>h.response({auth:{distributor_id:h.ownerB,client_id:f.CLIENT}}));await f.invoke('handleAuthenticated()');await f.settle();const auth=f.ctx.captureAuthSession();stale();await f.settle();assert.deepEqual(f.ctx.captureAuthSession(),auth);assert.equal(f.ctx.currentAccount(),h.ownerB);assert.ok(f.ctx.pendingAccountDeletion(f.OWNER));
 }finally{h.clean();}
});

test('same-owner recovery sign-in with accepted receipt reaches confirmation even when cleanup clears auth',async()=>{
 const h=setup(),{f}=h;try{
  f.take('A-accepted-recovery');await f.ctx.rememberAccountDeletion(f.OWNER,'token-A');f.ctx.deletionRecoveryOwner=f.OWNER;f.ctx.deletionRecovery='retry';
  h.setRoute(async(url)=>url.endsWith('/login/phone')?h.response({token:'token-A'}):url.endsWith('/deletion')?h.response({deletion:{status:'completed',requested_at:'2026-11-16T00:00:00.000Z',distributor_id:f.OWNER,client_id:f.CLIENT}}):h.response({auth:{distributor_id:f.OWNER,client_id:f.CLIENT}}));
  await f.invoke("signInForDeletionRecovery('9999999999','disposable','IN')");assert.equal(f.ctx.deletionRecovery,null);assert.equal(f.ctx.deletionNotice,true);assert.equal(f.ctx.screen,'login');assert.equal(f.ctx.captureAuthSession().token,null);assert.equal(f.ctx.pendingAccountDeletion(f.OWNER),null);
 }finally{h.clean();}
});

test('delayed bootstrap recovery cannot replace B UI after use-another-account and sign-in',async()=>{
 const h=setup(),{f}=h;try{
  await f.ctx.rememberAccountDeletion(f.OWNER,'token-A');const entered=deferred(),held=deferred();h.setRoute(async()=>{entered.resolve();return held.promise;});
  f.ctx.getLanguagePref=async()=>null;const bootstrap=f.invoke('bootstrapApp()');await entered.promise;f.invoke('handleLogout()');await f.settle();f.ctx.setAuthToken('token-B');h.data.set('auth_token','token-B');h.setRoute(async()=>h.response({auth:{distributor_id:h.ownerB,client_id:f.CLIENT}}));await f.invoke('handleAuthenticated()');await f.settle();const auth=f.ctx.captureAuthSession();f.ctx.screen='question';
  held.resolve(h.response({error:'token_expired'},401));await bootstrap;assert.equal(f.ctx.screen,'question');assert.equal(f.ctx.currentAccount(),h.ownerB);assert.deepEqual(f.ctx.captureAuthSession(),auth);assert.equal(f.ctx.deletionRecovery,null);
 }finally{h.clean();}
});

test('held deletion + actual expiry + B phone sign-in + Keep survives late A acceptance and restart',async()=>{
 const h=setup(),{f}=h;try{
  const questions=structuredClone(f.ctx.questions),a=f.take('A-expiry-control'),held=deferred(),entered=deferred();
  h.setRoute(async(url,opts)=>{if(opts.method==='DELETE'){entered.resolve();return held.promise;}return h.response({auth:{distributor_id:f.OWNER,client_id:f.CLIENT}});});
  const deleting=f.invoke("handleDeleteAccount('disposable-password')");await entered.promise;
  f.invoke("handleSessionExpired('token_expired')");await f.settle();await f.settle();assert.equal(f.ctx.deletionRecoveryOwner,f.OWNER);assert.equal(f.ctx.captureAuthSession().token,null);
  f.invoke('leaveDeletionRecovery(deletionUIVersion.current, deletionRecoveryOwner, captureAuthSession())');await f.settle();
  h.setRoute(async url=>url.endsWith('/login/phone')?h.response({token:'token-B'}):h.response({auth:{distributor_id:h.ownerB,client_id:f.CLIENT}}));
  await f.ctx.loginByPhone('9999999999','disposable','IN');await f.invoke('handleAuthenticated()');await f.settle();assert.equal(f.ctx.currentAccount(),h.ownerB);
  f.ctx.questions=questions;f.ctx.sessionRestored=true;f.ctx.consentAccepted=true;
  const file=new f.File(f.ctx.accountDirectory(h.ownerB),'recordings/B-kept.mp4');file.create();file.write('synthetic B kept footage');
  const take={...a,id:'B-kept',filePath:file.uri};Object.assign(f.ctx,{screen:'question',phase:'reviewTrim',questionIndex:0,takesByQuestion:{0:[take]},selectedTakeId:take.id});
  f.invoke('handleKeepTake()');f.effect('const persistedScreen');assert.equal(f.ctx.loadSession().videos[0].id,'B-kept');const before=JSON.stringify(f.ctx.loadSession()),auth=f.ctx.captureAuthSession();
  held.resolve(h.response({deletion:{status:'pending',requested_at:'2026-11-16T00:00:00.000Z',distributor_id:f.OWNER,client_id:f.CLIENT}},202));await deleting;await f.settle();
  assert.equal(JSON.stringify(f.ctx.loadSession()),before);assert.deepEqual(f.ctx.captureAuthSession(),auth);assert.equal(h.data.get('auth_token'),'token-B');assert.equal(f.ctx.deletionBusy,false);assert.equal(f.ctx.videos[0].id,'B-kept');assert.equal(file.textSync(),'synthetic B kept footage');assert.equal(new f.File(a.filePath).exists,false);
  f.ctx.videos=[];f.ctx.takesByQuestion={};f.invoke('restoreOwnedProgress(true, questions)');assert.equal(f.ctx.videos[0].id,'B-kept');assert.equal(f.ctx.currentAccount(),h.ownerB);
 }finally{h.clean();}
});
