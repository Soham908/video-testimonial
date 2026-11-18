const {test}=require('node:test');
const assert=require('node:assert/strict');
const {transportFixture}=require('./helpers/upload-transport.cjs');
const fastTimers={setTimeout:(fn,ms)=>setTimeout(fn,Math.min(ms,1))};

function queuedFixture({failure,stalled=false,cancelOnPoll=false,fresh=false}={}) {
 const f=transportFixture(fastTimers),basePost=f.api.apiPost,baseGet=f.api.apiGet;
 let queued=false,polls=0,workerRuns=0,creates=0;
 f.api.apiPost=async(endpoint,...args)=>{
  if(!endpoint.endsWith('/confirm')){const result=await basePost(endpoint,...args);return endpoint==='/segments/upload-attempts'?{...result,created:fresh&&++creates===1}:result;}
  queued=true;polls=0;workerRuns++;
  return {...f.envelope(false,false),state:'validating'};
 };
 f.api.apiGet=async(endpoint,...args)=>{
  const initial=await baseGet(endpoint,...args);
  if(!queued||endpoint.endsWith('upload-capabilities'))return initial;
  if(cancelOnPoll){f.ctx.activateAccount('another-account');return initial;}
  if(stalled===true||(stalled==='after-put'&&f.puts.length)||++polls===1)return {...initial,state:'validating',upload:null};
  queued=false;
  if(failure)return {...initial,state:'awaiting_upload',upload:null,error_code:failure};
  if(!f.puts.length)return {...initial,state:'awaiting_upload',upload:null,error_code:'video_not_found'};
  f.setAccepted();return f.envelope(true,false);
 };
 return {...f,runs:()=>workerRuns,release:()=>{queued=false;f.setAccepted();}};
}

test('worker queued confirmation permits only an explicit missing-source result to trigger exact native PUT',async()=>{
 const f=queuedFixture();try{
  const a=f.take('async-validated'),b=f.take('private-unapproved',0,{isPrimary:false});await f.approve(a);
  const result=await f.transfer();assert.equal(result.segmentId,f.SEGMENT);assert.equal(f.runs(),2);
  assert.equal(f.puts.length,1);assert.equal(f.puts[0].path,a.filePath);assert.ok(new f.File(b.filePath).exists);
  assert.equal(f.removed.length,0);assert.equal(f.entry().confirmation,null,'transport alone cannot mutate saved approval');
 }finally{f.clean();}
});

test('worker infrastructure failure never permits PUT or removes either take',async()=>{
 const f=queuedFixture({failure:'media_sandbox_unavailable'});try{
  const a=f.take('infra-original'),b=f.take('infra-private',0,{isPrimary:false});await f.approve(a);
  await assert.rejects(f.transfer());assert.equal(f.puts.length,0);assert.ok(new f.File(a.filePath).exists);assert.ok(new f.File(b.filePath).exists);assert.equal(f.removed.length,0);
 }finally{f.clean();}
});

test('busy validation queue times out safely then restart recovers the durable exact receipt with no extra PUT',async()=>{
 const f=queuedFixture({stalled:'after-put'});try{
  await f.approve(f.take('queued-restart'));await assert.rejects(f.transfer(),/still checking/);
  assert.equal(f.puts.length,1);assert.equal(f.runs(),2);assert.equal(f.entry().attempt.attemptId,f.ATTEMPT);
  f.release();const result=await f.transfer();assert.equal(result.receipt.attempt_id,f.ATTEMPT);assert.equal(f.runs(),2);assert.equal(f.puts.length,1);
 }finally{f.clean();}
});

test('account switch while waiting on worker cannot upload or acknowledge the former account',async()=>{
 const f=queuedFixture({cancelOnPoll:true});try{
  await f.approve(f.take('queued-account-switch'));await assert.rejects(f.transfer(),/Account changed/);
  assert.equal(f.puts.length,0);assert.equal(f.entry().confirmation,null);assert.equal(f.removed.length,0);
 }finally{f.clean();}
});


test('a proven new server key uploads immediately without queuing a redundant missing-source probe',async()=>{
 const f=queuedFixture({fresh:true});try{
  const a=f.take('new-key');await f.approve(a);const result=await f.transfer();
  assert.equal(result.segmentId,f.SEGMENT);assert.equal(f.runs(),1);assert.equal(f.puts.length,1);assert.equal(f.puts[0].path,a.filePath);
  assert.equal(f.puts[0].options.headers['If-None-Match'],'*');
 }finally{f.clean();}
});

test('a restored attempt never trusts a fresh-key hint from GET and still confirms before PUT',async()=>{
 const f=queuedFixture({fresh:true});try{
  await f.approve(f.take('restore-key'));await f.api.apiPost('/segments/upload-attempts',f.entry().intent);
  f.checkpoint({attemptId:f.ATTEMPT,requiredHeaders:null,expiresAt:null});
  const prior=f.api.apiGet;f.api.apiGet=async(...args)=>({...await prior(...args),created:true});
  const result=await f.transfer();assert.equal(result.segmentId,f.SEGMENT);assert.equal(f.runs(),2);assert.equal(f.puts.length,1);
 }finally{f.clean();}
});

test('switching the displayed take while worker validation is pending cannot replace the approved upload',async()=>{
 const f=queuedFixture({fresh:true});try{
  const a=f.take('approved-during-queue'),b=f.take('selected-later',0,{isPrimary:false});await f.approve(a);
  const prior=f.api.apiGet;let switched=false;
  f.api.apiGet=async(...args)=>{if(f.puts.length&&!switched){switched=true;f.ctx.videos=[{...a,isPrimary:false},{...b,isPrimary:true}];f.ctx.selectedTakeId=b.id;}return prior(...args);};
  const result=await f.transfer();assert.equal(switched,true);assert.equal(result.receipt.intent.take_id,a.id);
  assert.equal(f.puts.length,1);assert.equal(f.puts[0].path,a.filePath);assert.ok(new f.File(b.filePath).exists);assert.equal(f.removed.length,0);
 }finally{f.clean();}
});
