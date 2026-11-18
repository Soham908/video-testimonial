const { test } = require('node:test');
const assert = require('node:assert/strict');

const {transportFixture}=require('./helpers/upload-transport.cjs');

test('actual uploader sends only frozen intent/file with exact signed checksum, write-once and length headers', async () => {
  const f=transportFixture();try {
    const a=f.take('transport-a',0,{trimStartSeconds:1.25,trimEndSeconds:8.75});const b=f.take('private-b',0,{isPrimary:false});
    const entry=await f.approve(a);const result=await f.transfer();
    assert.equal(result.segmentId,f.SEGMENT);assert.equal(f.puts.length,1);assert.equal(f.puts[0].path,a.filePath);
    assert.equal(f.puts[0].options.httpMethod,'PUT');assert.equal(f.closedHandles.length,2,'one approval SHA plus one fresh pre-PUT SHA');
    assert.equal(f.puts[0].options.headers['Content-Length'],String(entry.file.sizeBytes));
    assert.equal(f.puts[0].options.headers['x-amz-checksum-sha256'],Buffer.from(entry.file.sha256,'hex').toString('base64'));
    assert.equal(f.puts[0].options.headers['If-None-Match'],'*');
    const creation=f.requests.find(r=>r.endpoint==='/segments/upload-attempts');
    assert.deepEqual(creation.body,entry.intent);assert.equal(creation.body.question_index,11);
    assert.equal(creation.body.trim_start_ms,1250);assert.equal(creation.body.trim_end_ms,8750);
    assert.ok(!f.requests.some(r=>/upload-url|\/segments\/confirm$/.test(r.endpoint)));
    assert.ok(new f.File(b.filePath).exists);assert.equal(f.removed.length,0);
  }finally{f.clean();}
});

test('changed approved bytes fail before attempt creation and preserve every local take',async()=>{
 const f=transportFixture();try{const a=f.take('changed');await f.approve(a);new f.File(a.filePath).write('replaced');
 await assert.rejects(f.transfer(),/recording changed/);assert.equal(f.requests.filter(r=>r.method==='POST').length,0);assert.equal(f.puts.length,0);assert.ok(new f.File(a.filePath).exists);
 }finally{f.clean();}
});

test('question identity/index/revision/script/resolved language changes fail before signing',async()=>{
 for(const patch of [{id:'50000000-0000-4000-8000-000000000099'},{index:99},{updated_at:'2026-11-12T00:00:00.000Z'},{text:'Changed'},{language:'mr'}]){
 const f=transportFixture();try{await f.approve(f.take('catalog'));f.ctx.questions[0]={...f.ctx.questions[0],...patch};await assert.rejects(f.transfer(),/question changed/);assert.equal(f.requests.filter(r=>r.method==='POST').length,0);assert.equal(f.puts.length,0);}finally{f.clean();}}
});

test('substitution during presign fails before native PUT',async()=>{
 const f=transportFixture();try{const a=f.take('post-sign');await f.approve(a);const original=f.api.apiPost;f.api.apiPost=async(...args)=>{const response=await original(...args);if(args[0]==='/segments/upload-attempts')new f.File(a.filePath).write('replaced');return response;};
 await assert.rejects(f.transfer(),/recording changed/);assert.equal(f.puts.length,0);assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}
});

test('substitution during PUT prevents accepting a receipt and keeps original',async()=>{
 const f=transportFixture();try{const a=f.take('during-put');await f.approve(a);f.File.prototype.upload=async function(){this.write('substituted during put');return {status:200};};
 await assert.rejects(f.transfer(),/recording changed/);assert.equal(f.requests.filter(r=>r.endpoint.endsWith('/confirm')).length,1,'only pre-PUT missing-object confirmation');assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}
});

test('account switch/caller cancellation during native PUT aborts and forbids confirmation',async()=>{
 for(const callerCancel of [false,true]){const f=transportFixture();try{await f.approve(f.take('cancel'));const controller=new AbortController();let signal;
 f.File.prototype.upload=async(_,options)=>{signal=options.signal;if(callerCancel)controller.abort();else f.ctx.activateAccount('other-account');return {status:200};};
 await assert.rejects(f.transfer(controller.signal),/Account changed/);assert.equal(signal.aborted,true);assert.equal(f.requests.filter(r=>r.endpoint.endsWith('/confirm')).length,1);assert.equal(f.removed.length,0);}finally{f.clean();}}
});

test('late confirm response cannot acknowledge media after account switch',async()=>{
 const f=transportFixture();try{await f.approve(f.take('late'));const original=f.api.apiPost;let confirms=0;f.api.apiPost=async(...args)=>{const response=await original(...args);if(args[0].endsWith('/confirm')){confirms++;f.ctx.activateAccount('other-account');}return response;};
 await assert.rejects(f.transfer(),/Account changed/);assert.equal(confirms,1);assert.equal(f.removed.length,0);}finally{f.clean();}
});

test('lost confirm response/restart recovers exact durable receipt without a second PUT, even with intake disabled',async()=>{
 const f=transportFixture();try{await f.approve(f.take('lost-confirm'));const original=f.api.apiPost;f.api.apiPost=async(...args)=>{const response=await original(...args);if(args[0].endsWith('/confirm'))throw new f.api.ApiError(0,'network_error');return response;};
 await assert.rejects(f.transfer(),/network_error/);assert.equal(f.puts.length,1);assert.equal(f.entry().confirmation,null);
 f.api.apiPost=async()=>{throw new Error('recovery cannot POST');};const calls=f.requests.length;const result=await f.transfer();assert.equal(result.segmentId,f.SEGMENT);assert.equal(f.puts.length,1);
 assert.deepEqual(f.requests.slice(calls).map(r=>r.endpoint),[`/segments/upload-attempts/${f.ATTEMPT}`]);
 }finally{f.clean();}
});

test('interrupted native PUT response recovers by confirm before another PUT',async()=>{
 const f=transportFixture();try{await f.approve(f.take('lost-put'));f.File.prototype.upload=async()=>{f.putExists();throw new Error('lost native response');};await assert.rejects(f.transfer(),/lost native/);
 const result=await f.transfer();assert.equal(result.segmentId,f.SEGMENT);assert.equal(f.puts.length,0);assert.ok(f.requests.some(r=>r.endpoint===`/segments/upload-attempts/${f.ATTEMPT}`));}finally{f.clean();}
});

test('durable-attempt write failure prevents native PUT and preserves local draft',async()=>{
 const f=transportFixture();try{const a=f.take('disk-fail');await f.approve(a);await assert.rejects(f.upload.uploadSegment(f.entry(),undefined,()=>{throw new Error('disk full');}),/disk full/);assert.equal(f.puts.length,0);assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}
});

test('capability mismatch/off/unavailable never falls back to canonical endpoints',async()=>{
 for(const capability of [null,{contract_version:1},{contract_version:2,intake_enabled:false}]){const f=transportFixture();try{await f.approve(f.take('capability'));f.api.apiGet=async()=>capability;await assert.rejects(f.transfer(),/not enabled/);assert.equal(f.puts.length,0);assert.equal(f.requests.filter(r=>r.method==='POST').length,0);}finally{f.clean();}}
});

test('wrong owner/attempt/take/hash/size/question/trim/CAS/source identity receipt never marks the take',async()=>{
 const mutators=[r=>r.distributor_id='other',r=>r.client_id='other',r=>r.attempt_id='30000000-0000-4000-8000-000000000099',r=>r.intent.take_id='wrong',r=>r.verified.source_sha256='0'.repeat(64),r=>r.verified.source_size_bytes++,r=>r.intent.question_id='50000000-0000-4000-8000-000000000099',r=>r.intent.trim_start_ms++,r=>r.intent.expected_current_segment_id=fakeUuid,r=>r.verified.source_identity.video_key='other-owner',r=>r.verified.source_identity.write_once=false,r=>r.verified.effective_trim_end_ms=0];
 for(const mutate of mutators){const f=transportFixture();try{await f.approve(f.take('bad-receipt'));const original=f.api.apiPost;f.api.apiPost=async(...args)=>{const response=await original(...args);if(response.receipt)mutate(response.receipt);return response;};await assert.rejects(f.transfer(),/receipt does not match/);assert.equal(f.entry().confirmation,null);assert.equal(f.removed.length,0);}finally{f.clean();}}
});
const fakeUuid='60000000-0000-4000-8000-000000000001';

test('missing checksum/conditional/size signed header fails closed before PUT',async()=>{
 for(const header of ['Content-Length','x-amz-checksum-sha256','If-None-Match']){const f=transportFixture();try{await f.approve(f.take('bad-headers'));const original=f.api.apiPost;f.api.apiPost=async(...args)=>{const response=await original(...args);if(response.upload)delete response.upload.required_headers[header];return response;};await assert.rejects(f.transfer(),/not enabled/);assert.equal(f.puts.length,0);}finally{f.clean();}}
});

test('unknown attempt is never treated as a missing object and cannot mint a replacement attempt',async()=>{
 const f=transportFixture();try{await f.approve(f.take('unknown'));f.checkpoint({attemptId:f.ATTEMPT,requiredHeaders:null,expiresAt:null});f.api.apiGet=async()=>{throw new f.api.ApiError(404,'upload_attempt_not_found');};await assert.rejects(f.transfer(),/upload_attempt_not_found/);assert.equal(f.puts.length,0);assert.equal(f.requests.length,0);}finally{f.clean();}
});

test('conditional PUT412 confirms this same exact attempt rather than overwriting',async()=>{
 const f=transportFixture();try{await f.approve(f.take('conditional'));f.File.prototype.upload=async()=>{f.putExists();return {status:412};};const receipt=await f.transfer();assert.equal(receipt.receipt.attempt_id,f.ATTEMPT);assert.equal(f.requests.filter(r=>r.endpoint==='/segments/upload-attempts').length,1);}finally{f.clean();}
});

// Exercise the real JSON/HTTP wrapper as well as the transport. A synthetic
// ApiError-only mock would miss an error/error_code mismatch on an API route.
function installRealApiOverFixture(f, overrideResponse) {
 const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
 const source=fs.readFileSync(path.join(__dirname,'../api.ts'),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 const module={exports:{}},priorGet=f.api.apiGet,priorPost=f.api.apiPost;const http=[];
 const fetch=async(url,options)=>{
  const endpoint=new URL(url).pathname;http.push({endpoint,options});
  if(overrideResponse)return overrideResponse(endpoint,options);
  try{const body=options.method==='POST'?await priorPost(endpoint,JSON.parse(options.body),options.signal):await priorGet(endpoint,options.signal);return{ok:true,status:200,text:async()=>JSON.stringify(body)};}
  catch(error){return{ok:false,status:error.status??500,text:async()=>JSON.stringify({error:error.code,error_code:error.code,...(endpoint.endsWith('/confirm')?f.envelope(false,false):{})})};}
 };
 new Function('module','exports','process','fetch',compiled)(module,module.exports,{env:{EXPO_PUBLIC_API_BASE_URL:'https://api.synthetic.invalid'}},fetch);
 Object.assign(f.api,module.exports);f.api.setAuthToken('synthetic-only-token');return http;
}

test('real api.ts parses standard missing-source404 and production uploader reaches native PUT then exact receipt',async()=>{
 const f=transportFixture();try{await f.approve(f.take('real-api-first-upload'));const http=installRealApiOverFixture(f);const confirmation=await f.transfer();assert.equal(confirmation.segmentId,f.SEGMENT);assert.equal(f.puts.length,1);assert.equal(http.filter(r=>r.endpoint.endsWith('/confirm')).length,2);assert.ok(http.every(r=>r.options.headers.Authorization==='Bearer synthetic-only-token'));assert.equal(f.puts[0].options.headers.Authorization,undefined);assert.deepEqual(f.durableAttempts.map(attempt=>attempt.confirmationRequested),[false,true,true]);}finally{f.clean();}
});

test('real api.ts HTTP409CAS and422rejection map to reviewable messages without acknowledgement/file deletion',async()=>{
 for(const [status,code,expected]of [[409,'current_revision_conflict',/Another answer was submitted/],[422,'invalid_media',/could not be accepted/]]){const f=transportFixture();try{const a=f.take('real-api-rejection');await f.approve(a);const original=f.api.apiPost;let confirms=0;f.api.apiPost=async(...args)=>{if(args[0].endsWith('/confirm')&&++confirms===2)throw new f.api.ApiError(status,code);return original(...args);};installRealApiOverFixture(f);await assert.rejects(f.transfer(),expected);assert.equal(f.entry().confirmation,null);assert.ok(new f.File(a.filePath).exists);assert.equal(f.removed.length,0);}finally{f.clean();}}
});

test('real api.ts old-serverHTML404 capability response gives compatible-service copy without fallback',async()=>{
 const f=transportFixture();try{await f.approve(f.take('real-api-old-server'));const http=installRealApiOverFixture(f,async()=>({ok:false,status:404,text:async()=>'<html>Not found</html>'}));await assert.rejects(f.transfer(),/Secure uploads are not enabled/);assert.equal(http.length,1);assert.equal(f.puts.length,0);}finally{f.clean();}
});


test('same-size changed bytes cannot pass fresh pre-PUT SHA even if the accidental MD5 guard is modeled as colliding',async()=>{
 const f=transportFixture();try{const a=f.take('same-size-substitution');await f.approve(a);const entry=f.entry();new f.File(a.filePath).write(Buffer.alloc(entry.file.sizeBytes,65));Object.defineProperty(f.File.prototype,'md5',{configurable:true,get(){return entry.file.md5;}});await assert.rejects(f.transfer(),/recording changed/);assert.equal(f.puts.length,0);assert.equal(f.entry().confirmation,null);assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}
});

test('capability renewal cannot move fresh pre-PUT SHA ahead of its last asynchronous response',async()=>{
 const f=transportFixture();try{const a=f.take('after-renew');await f.approve(a);const entry=f.entry();const original=f.api.apiPost;let creates=0;f.api.apiPost=async(...args)=>{const response=await original(...args);if(args[0]==='/segments/upload-attempts'){creates++;if(creates===1)response.upload.expires_at=new Date(Date.now()-1000).toISOString();else{new f.File(a.filePath).write(Buffer.alloc(entry.file.sizeBytes,90));Object.defineProperty(f.File.prototype,'md5',{configurable:true,get(){return entry.file.md5;}});}}return response;};await assert.rejects(f.transfer(),/recording changed/);assert.equal(creates,2);assert.equal(f.puts.length,0);assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}
});

test('post-PUT same-size accidental substitution blocks local acknowledgement',async()=>{
 const f=transportFixture();try{const a=f.take('post-put-same-size');await f.approve(a);f.File.prototype.upload=async function(){this.write(Buffer.alloc(f.entry().file.sizeBytes,90));return{status:200};};await assert.rejects(f.transfer(),/recording changed/);assert.equal(f.requests.filter(r=>r.endpoint.endsWith('/confirm')).length,1);assert.equal(f.entry().confirmation,null);assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}
});
