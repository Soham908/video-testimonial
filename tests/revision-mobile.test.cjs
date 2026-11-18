const {test}=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const {fixture}=require('./helpers/appflow-upload.cjs');
const approve=f=>f.invoke('approveUpload()');
const persist=f=>f.effect('const persistedScreen');

async function acceptedFixture(f,take,segmentId=f.SEGMENT,attemptId=f.ATTEMPT){
 const batch=await f.ctx.createApprovedBatch([take],f.ctx.questions,f.ctx.readUploadFileIdentity,{ownerId:f.OWNER,clientId:f.CLIENT});
 const pinned=f.ctx.checkpointBatchAttempt(batch,batch.entries[0].id,{attemptId,requiredHeaders:null,expiresAt:null});
 const confirmed=f.ctx.confirmBatchEntry(pinned,pinned.entries[0].id,f.confirmation(pinned.entries[0],segmentId,attemptId));
 const video=f.ctx.acknowledgeConfirmedTakes([take],confirmed)[0],receipt=confirmed.entries[0].confirmation.receipt;
 const segment={segment_id:receipt.segment_id,question_id:receipt.intent.question_id,question_index:receipt.intent.question_index,integrity_status:'verified_v2',receipt_id:receipt.receipt_id,source_sha256:receipt.verified.source_sha256,source_size_bytes:receipt.verified.source_size_bytes,source_duration_ms:receipt.verified.source_duration_ms,trim_start_ms:receipt.intent.trim_start_ms,trim_end_ms:receipt.intent.trim_end_ms,playback_status:'ready',playback_url:'https://synthetic.invalid/selected',duration_seconds:take.durationSeconds,updated_at:'same-timestamp'};
 return{confirmed,video,receipt,segment};
}

test('bounded SHA256 agrees with Node at block/chunk boundaries and closes native handles',async()=>{
 const f=fixture();try{for(const size of [1,63,64,65,262143,262144,262145,1048593]){const a=f.take('hash-'+size);const bytes=Buffer.alloc(size);for(let i=0;i<size;i++)bytes[i]=(i*31+17)%256;new f.File(a.filePath).write(bytes);
 const before=f.closedHandles.length;const identity=await f.ctx.readUploadFileIdentity(a.filePath);assert.equal(identity.sizeBytes,size);assert.equal(identity.sha256,crypto.createHash('sha256').update(bytes).digest('hex'));assert.equal(f.closedHandles.length,before+1);}
 assert.ok(Math.max(...f.reads)<=262144);const empty=f.take('empty');new f.File(empty.filePath).write('');await assert.rejects(f.ctx.readUploadFileIdentity(empty.filePath));
 }finally{f.clean();}
});

test('hash cancellation/account switch closes handle and retains source',async()=>{
 for(const accountChange of [false,true]){const f=fixture();try{const a=f.take('abort-hash');new f.File(a.filePath).write(Buffer.alloc(1024*1024+1,17));const controller=new AbortController();const reading=f.ctx.readUploadFileIdentity(a.filePath,controller.signal);setTimeout(()=>accountChange?f.ctx.activateAccount('other'):controller.abort(),0);await assert.rejects(reading,/Account changed/);assert.equal(f.closedHandles.length,1);assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}}
});

test('preparing approval locks selection before await and second tap cannot create another permission',async()=>{
 const f=fixture();try{const a=f.take('preparing-a'),b=f.take('preparing-b',0,{isPrimary:false});f.ctx.videos=[a,b];let release;f.ctx.requireUploadCapabilities=()=>new Promise(resolve=>{release=resolve;});const pending=approve(f);assert.equal(f.ctx.uploadPreparing,true);assert.ok(f.ctx.preparingUploadRef.current);
 f.invoke(`handleSwitchPrimary(0,${JSON.stringify(b.id)})`);f.invoke(`updatePoolTake(0,${JSON.stringify(a.id)},{trimStartSeconds:6})`);f.invoke('handleEditTakes(0)');f.invoke('startRetake(0)');await approve(f);
 assert.equal(f.ctx.videos[0].isPrimary,true);assert.equal(f.ctx.videos[0].trimStartSeconds,undefined);assert.equal(f.ctx.retakeQuestionIndex,null);assert.equal(f.ctx.approvedBatch,null);
 release({limits:{source_size_bytes:268435456,duration_ms:180000}});await pending;assert.equal(f.ctx.approvedBatch.entries[0].video.id,a.id);assert.equal(f.ctx.loadSession().approvedBatch.id,f.ctx.approvedBatch.id);assert.equal(f.sent.length,0);
 }finally{f.clean();}
});

test('account change while preparing cannot save, grant approval or mark another account',async()=>{
 const f=fixture();try{f.ctx.videos=[f.take('preparing-switch')];let release;f.ctx.requireUploadCapabilities=()=>new Promise(resolve=>{release=resolve;});const pending=approve(f);f.ctx.activateAccount('other');release({limits:{source_size_bytes:268435456,duration_ms:180000}});await pending;assert.equal(f.ctx.approvedBatch,null);assert.equal(f.ctx.uploadPreparing,false);assert.equal(f.ctx.loadSession(),null);assert.equal(f.sent.length,0);}finally{f.clean();}
});

test('pending approval protects the same stable question after reorder and leaves unrelated question editable',async()=>{
 const f=fixture();try{const a=f.take('reordered-a');f.ctx.videos=[a];await approve(f);const before=structuredClone(f.ctx.approvedBatch);f.ctx.questions.reverse();f.ctx.videos=f.ctx.reconcileTakePositions(f.ctx.videos,f.ctx.questions);persist(f);
 assert.equal(f.ctx.videos[0].questionIndex,1);assert.equal(f.invoke('questionUploadLocked(1)'),true);assert.equal(f.invoke('questionUploadLocked(0)'),false);f.invoke(`updatePoolTake(1,${JSON.stringify(a.id)},{trimStartSeconds:3})`);f.invoke('startRetake(1)');assert.equal(f.ctx.videos[0].trimStartSeconds,undefined);assert.equal(f.ctx.retakeQuestionIndex,null);assert.deepEqual(JSON.parse(JSON.stringify(f.ctx.approvedBatch)),before);assert.ok(new f.File(a.filePath).exists);
 }finally{f.clean();}
});

test('removed question stays recoverable and cannot block or enter a new current-question approval',async()=>{
 const f=fixture();try{const removed=f.take('removed-q'),valid=f.take('current-q',1);f.ctx.videos=[removed,valid];f.ctx.questions=f.ctx.questions.slice(1);f.ctx.videos=f.ctx.reconcileTakePositions(f.ctx.videos,f.ctx.questions);await approve(f);
 assert.deepEqual(Array.from(f.ctx.approvedBatch.entries,e=>e.video.id),[valid.id]);assert.equal(f.ctx.videos.find(v=>v.id===removed.id).questionIndex,-1);assert.equal(f.jsxProp('MyVideosScreen','unmatchedTakes')[0].id,removed.id);assert.ok(new f.File(removed.filePath).exists);
 }finally{f.clean();}
});

test('native duration belongs to exact selected take; stale A event cannot update B',()=>{
 const f=fixture();try{const a=f.take('duration-a',0,{durationVerified:false,durationSeconds:20}),b=f.take('duration-b',0,{durationVerified:false,durationSeconds:30});Object.assign(f.ctx,{videos:[],takesByQuestion:{0:[a,b]},selectedTakeId:b.id,questionIndex:0,renderAccountScope:f.ctx.accountScope()});f.invoke(`handleMeasuredDuration(${JSON.stringify(a.id)},${JSON.stringify(a.filePath)},5)`);assert.equal(f.ctx.takesByQuestion[0][1].durationSeconds,30);assert.equal(f.ctx.takesByQuestion[0][0].durationSeconds,20);
 f.invoke(`handleMeasuredDuration(${JSON.stringify(b.id)},${JSON.stringify(b.filePath)},2.125)`);assert.equal(f.ctx.takesByQuestion[0][1].durationSeconds,2.125);assert.equal(f.ctx.takesByQuestion[0][1].durationVerified,true);
 }finally{f.clean();}
});

test('wall-clock-only duration cannot keep or approve until native media metadata is observed',async()=>{
 const f=fixture();try{const a=f.take('unverified',0,{durationVerified:false});a.questionIndex=0;a.questionSnapshot=f.ctx.snapshotQuestion(f.ctx.questions[0]);Object.assign(f.ctx,{takesByQuestion:{0:[a]},selectedTakeId:a.id,questionIndex:0});f.invoke('handleKeepTake()');assert.equal(f.ctx.videos.length,0);await assert.rejects(f.ctx.createApprovedBatch([a],f.ctx.questions,f.ctx.readUploadFileIdentity,{ownerId:f.OWNER,clientId:f.CLIENT}),/duration and trim/);
 }finally{f.clean();}
});

test('millisecond trims stay finite/nonempty for subsecond, one/two second, near-end and restored-invalid cases',()=>{
 const f=fixture();try{for(const duration of [.001,.2,.999,1,2,2.001,12]){for(const [start,end] of [[-1,0],[NaN,Infinity],[duration,duration],[0,duration+99],[duration-.0001,duration]]){const normalized=f.ctx.normalizeReviewTrim(duration,start,end);assert.ok(normalized);const request=f.ctx.requestedTrim({durationSeconds:duration,durationVerified:true,trimStartSeconds:normalized.startSeconds,trimEndSeconds:normalized.endSeconds});assert.ok(request);assert.ok(request.startMs<(request.endMs??Math.floor(duration*1000)));}}
 for(const duration of [.2,1,2])assert.equal(f.ctx.trimAfterRemovingTail(duration,0,true),null);
 assert.equal(f.ctx.trimAfterRemovingTail(2.001,0,true).endSeconds,.001);assert.equal(f.ctx.requestedTrim({durationSeconds:12.0009,durationVerified:true,trimStartSeconds:0,trimEndSeconds:12.0009}).endMs,null);
 }finally{f.clean();}
});

test('timeline uses handle-relative drag delta, independent of a nonzero screen origin',()=>{
 const f=fixture();try{assert.deepEqual(f.ctx.draggedTrimMs('start',20,200,10000,2000,8000),{startMs:3000,endMs:8000});assert.deepEqual(f.ctx.draggedTrimMs('end',-20,200,10000,2000,8000),{startMs:2000,endMs:7000});assert.deepEqual(f.ctx.draggedTrimMs('start',99999,200,10000,2000,8000),{startMs:7999,endMs:8000});assert.deepEqual(f.ctx.draggedTrimMs('end',-99999,200,10000,2000,8000),{startMs:2000,endMs:2001});}finally{f.clean();}
});

test('full-source requested null end matches its verified revision; same timestamp/new revision cannot reuse local A',async()=>{
 const f=fixture();try{const {video,segment}=await acceptedFixture(f,f.take('accepted-full'));assert.equal(f.ctx.localMatchesRevision(video,segment),true);const rows=f.ctx.buildAnswerRows([video],f.ctx.questions,[segment]);assert.equal(rows[0].play.filePath,video.filePath);
 const c={...segment,segment_id:'40000000-0000-4000-8000-000000000099',receipt_id:'30000000-0000-4000-8000-000000000099',playback_url:'https://synthetic.invalid/selected-c'};assert.equal(f.ctx.localMatchesRevision(video,c),false);assert.equal(f.ctx.buildAnswerRows([video],f.ctx.questions,[c])[0].play.filePath,c.playback_url);
 }finally{f.clean();}
});

test('trimmed private/accepted local default and every take pointer withhold raw source; original/edit remains available',async()=>{
 const f=fixture();try{const a=f.take('trimmed-local',0,{trimStartSeconds:1,trimEndSeconds:8});let row=f.ctx.buildAnswerRows([a],f.ctx.questions,[])[0];assert.equal(row.play,null);assert.equal(row.takes[0].play,null);assert.equal(row.hasLocalTakes,true);assert.equal(row.playbackStatus,'local_trim');
 const {video,segment}=await acceptedFixture(f,a);row=f.ctx.buildAnswerRows([video],f.ctx.questions,[{...segment,playback_status:'pending',playback_url:null}])[0];assert.equal(row.play,null);assert.equal(row.takes[0].play,null);assert.equal(row.hasLocalTakes,true);assert.equal(row.uploaded,true);
 const ready=f.ctx.buildAnswerRows([video],f.ctx.questions,[segment])[0];assert.equal(ready.play.filePath,segment.playback_url);assert.notEqual(ready.play.filePath,video.filePath);
 // Execute the actual row renderer and its original/edit action.
 const source=fs.readFileSync(path.join(__dirname,'../screens/MyVideosScreen.tsx'),'utf8');const compiled=ts.transpileModule(source+'\nexport {AnswerRowCard as TestRow};',{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;const module={exports:{}};const jsx=(type,props)=>({type,props});new Function('require','module','exports',compiled)(id=>{if(id==='react/jsx-runtime')return{jsx,jsxs:jsx};if(id==='react')return{};if(id==='react-native')return{View:'View',Text:'Text',Pressable:'Pressable'};if(id.includes('fonts'))return{containsDevanagari:()=>false};if(id.includes('useStrings'))return{useStrings:()=>({t:key=>key})};return{};},module,module.exports);
 let edited=false;const tree=module.exports.TestRow({questionIndex:0,questionText:'Synthetic',answer:row,expanded:true,onToggleExpand:()=>{},onPressAnswer:()=>{},onRetake:()=>{},onEditTakes:()=>{edited=true;},onSwitchPrimary:()=>{},styles:new Proxy({},{get:()=>({})}),colors:{}});
 function visit(node){if(!node||typeof node!=='object')return;if(node.props?.onPress&&node.props?.children==='uploadApproval.originalAndEdit')node.props.onPress();for(const child of [node.props?.children].flat())visit(child);}visit(tree);assert.equal(edited,true);
 }finally{f.clean();}
});

test('explicit replacement review pins displayed head and reuses private B without silently taking later C',async()=>{
 const f=fixture();try{const b=f.take('private-rebase');Object.assign(f.ctx,{videos:[b],selectedTakeId:b.id,questionIndex:0});const aId='40000000-0000-4000-8000-000000000011',cId='40000000-0000-4000-8000-000000000012';f.ctx.fetchSegments=async()=>[{question_id:b.questionSnapshot.id,question_index:11,segment_id:aId,integrity_status:'verified_v2',playback_status:'ready',playback_url:'https://synthetic.invalid/a'}];await f.invoke('reviewReplacementBase()');assert.equal(f.ctx.replacementReview.segmentId,aId);f.ctx.serverSegments=[{question_id:b.questionSnapshot.id,segment_id:cId}];f.invoke('acceptReviewedReplacementBase()');assert.equal(f.ctx.videos[0].expectedCurrentSegmentId,aId);assert.equal(f.ctx.videos[0].id,b.id);assert.ok(new f.File(b.filePath).exists);await approve(f);assert.equal(f.ctx.approvedBatch.entries[0].intent.expected_current_segment_id,aId);
 }finally{f.clean();}
});

test('legacy v3 approval and MD5-only acknowledgement retain owned files but never restore upload authority',async()=>{
 const f=fixture();try{const a=f.take('legacy-v3');a.uploadAcknowledgement={identity:f.ctx.takeIdentity(a),confirmedAt:new Date().toISOString()};f.ctx.videos=[a];persist(f);const file=f.ctx.accountFile('session-state.json'),raw=JSON.parse(file.textSync());raw.version=3;raw.approvedBatch={version:1,status:'pending',id:'legacy',entries:[{video:a,file:{sizeBytes:1,md5:'old'}}]};raw.uploadConfirmed=true;file.write(JSON.stringify(raw));const restored=f.ctx.loadSession();assert.equal(restored.approvedBatch,null);assert.equal(restored.uploadConfirmed,false);assert.equal(restored.videos[0].uploadAcknowledgement,undefined);assert.ok(new f.File(a.filePath).exists);}finally{f.clean();}
});

test('restored review with no explicit selection measures its fallback take and can explicitly bind legacy snapshot',()=>{
 const f=fixture();try{const a=f.take('restored-fallback',0,{durationVerified:false,questionSnapshot:undefined});Object.assign(f.ctx,{videos:[a],selectedTakeId:null,questionIndex:0,renderAccountScope:f.ctx.accountScope()});f.invoke(`handleMeasuredDuration(${JSON.stringify(a.id)},${JSON.stringify(a.filePath)},3.25)`);assert.equal(f.ctx.videos[0].durationVerified,true);assert.equal(f.ctx.videos[0].durationSeconds,3.25);f.invoke('bindReviewedQuestion()');assert.equal(f.ctx.videos[0].questionSnapshot.id,f.ctx.questions[0].id);assert.equal(f.ctx.videos[0].expectedCurrentSegmentId,null);}finally{f.clean();}
});

test('server-current playback carries its immutable question text rather than stale local or newly edited catalog text',async()=>{
 const f=fixture();try{const {video,segment}=await acceptedFixture(f,f.take('snapshot-label'));const current={...segment,segment_id:'40000000-0000-4000-8000-000000000099',question_text:'Server revision captured question',playback_url:'https://synthetic.invalid/new-selected'};f.ctx.questions[0].text='Mutable catalog changed again';const row=f.ctx.buildAnswerRows([video],f.ctx.questions,[current])[0];assert.equal(row.questionText,current.question_text);assert.equal(row.play.filePath,current.playback_url);}finally{f.clean();}
});


test('A accepted then B accepted then selecting historical A needs fresh approval and retains its old server receipt',async()=>{
 const f=fixture();try{const a=await acceptedFixture(f,f.take('historical-select-a'));const b=await acceptedFixture(f,f.take('historical-select-b'),'40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002');Object.assign(f.ctx,{videos:[{...a.video,isPrimary:false},{...b.video,isPrimary:true}],serverSegments:[b.segment],approvedBatch:b.confirmed});f.ctx.approvedBatchRef.current=b.confirmed;f.invoke(`handleSwitchPrimary(0,${JSON.stringify(a.video.id)})`);const selected=f.ctx.videos.find(v=>v.id===a.video.id);assert.equal(f.ctx.hasExactAcknowledgement(selected),false);assert.equal(selected.uploadAcknowledgement.receipt.segment_id,a.receipt.segment_id);assert.equal(selected.expectedCurrentSegmentId,a.receipt.segment_id,'never silently rebase to latest B');persist(f);assert.equal(f.ctx.hasExactAcknowledgement(f.ctx.loadSession().videos.find(v=>v.id===a.video.id)),false);f.invoke('openUploadReview()');await approve(f);assert.equal(f.ctx.approvedBatch.entries[0].video.id,a.video.id);assert.equal(f.ctx.approvedBatch.entries[0].confirmation,null);assert.equal(f.ctx.approvedBatch.entries[0].intent.expected_current_segment_id,a.receipt.segment_id);assert.ok(new f.File(a.video.filePath).exists);}finally{f.clean();}
});

test('explicit Keep of an unchanged currently accepted A retains its exact acknowledgement',async()=>{
 const f=fixture();try{const a=await acceptedFixture(f,f.take('unchanged-current-a'));Object.assign(f.ctx,{videos:[a.video],serverSegments:[a.segment],questionIndex:0,selectedTakeId:a.video.id,retakeQuestionIndex:0,approvedBatch:a.confirmed});f.ctx.approvedBatchRef.current=a.confirmed;f.invoke('handleKeepTake()');assert.equal(f.ctx.hasExactAcknowledgement(f.ctx.videos[0]),true);assert.equal(f.ctx.videos[0].expectedCurrentSegmentId,a.video.expectedCurrentSegmentId);}finally{f.clean();}
});

test('quarantined legacy upload is explicitly unverified rather than indefinitely processing and never exposes raw source',()=>{
 const f=fixture();try{const legacy={segment_id:f.SEGMENT,question_id:null,question_index:11,integrity_status:'legacy_unverified',playback_status:'legacy_unverified',playback_url:'https://synthetic.invalid/legacy-raw'};const row=f.ctx.buildAnswerRows([],f.ctx.questions,[legacy])[0];assert.equal(row.play,null);assert.equal(row.takes[0].play,null);assert.equal(row.playbackStatus,'legacy_unverified');assert.equal(row.serverSegmentId,f.SEGMENT);assert.equal(row.hasLocalTakes,false);}finally{f.clean();}
});
