const { test } = require('node:test');
const assert = require('node:assert/strict');
const { fixture } = require('./helpers/appflow-upload.cjs');

// These scenarios use production AppFlow functions/effects with synthetic
// recordings and a held uploader. No service, token, simulator or real media.
const persist = f => f.effect('const persistedScreen');
const transfer = f => f.effect('await uploadSegment(');
const approve = f => f.invoke('approveUpload()');
const bindAttempt = (f, batch, entryId) => f.ctx.checkpointBatchAttempt(batch, entryId, {attemptId:f.ATTEMPT,requiredHeaders:null,expiresAt:null});

test('completed Q1 approval cannot acquire privately kept Q2 on checkpoint and restart', async () => {
  const f = fixture(); try {
    const q1 = f.take('approved-q1'); f.ctx.videos = [q1];
    await approve(f);
    const beforeTransfer = f.ctx.loadSession();
    assert.equal(beforeTransfer.approvedBatch.entries[0].video.id, q1.id, 'approval is durable before upload starts');
    assert.equal(f.sent.length, 0);
    transfer(f); await f.settle(); persist(f);
    assert.deepEqual(f.sent.map(v => v.video.id), [q1.id]);
    const q2 = f.take('private-q2', 1);
    Object.assign(f.ctx, { questionIndex: 1, screen: 'question', phase: 'reviewTrim', takesByQuestion: { 1: [q2] }, selectedTakeId: q2.id });
    f.invoke('handleKeepTake()'); persist(f);
    const stored = f.ctx.loadSession();
    assert.equal(stored.uploadConfirmed, false, 'completed approval is durably closed');
    assert.equal(stored.approvedBatch.entries.length, 1, 'private take never expands the batch');
    f.ctx.videos = []; f.ctx.approvedBatch = null;
    f.invoke('restoreOwnedProgress(true, questions)'); transfer(f); await f.settle();
    assert.deepEqual(f.sent.map(v => v.video.id), [q1.id]);
    assert.ok(f.ctx.videos.some(v => v.id === q2.id));
    assert.ok(new f.File(q2.filePath).exists);
  } finally { f.clean(); }
});

test('interrupted approval resumes only its frozen take, question and trim despite later private answers', async () => {
  const f = fixture(); try {
    const a = f.take('original-a', 0, { trimStartSeconds: 2, trimEndSeconds: 9 });
    f.ctx.videos = [a]; await approve(f);
    const saved = f.ctx.loadSession();
    const b = f.take('later-private-b', 1);
    saved.videos.push(b);
    saved.videos[0].trimStartSeconds = 5;
    f.ctx.saveSession(saved);
    f.ctx.approvedBatch = null; f.ctx.videos = [];
    f.invoke('restoreOwnedProgress(true, questions)');
    // A refresh cannot substitute the current question definition in an approved entry.
    f.ctx.questions[0] = { id: 'replacement-question', index: 99, text: 'Changed question' };
    transfer(f); await f.settle();
    assert.deepEqual(f.sent.map(v => v.video.id), [a.id]);
    assert.equal(f.sent[0].video.trimStartSeconds, 2);
    assert.equal(f.sent[0].video.trimEndSeconds, 9);
    assert.ok(JSON.stringify(f.sent[0]).includes('50000000-0000-4000-8000-000000000001'));
    assert.ok(!JSON.stringify(f.sent[0]).includes('replacement-question'));
    assert.ok(new f.File(b.filePath).exists);
    assert.ok(!f.ctx.approvedBatch.entries.some(entry => entry.video.id === b.id));
  } finally { f.clean(); }
});

test('primary, trim, edit, delete, retake and second approval cannot replace an in-flight take', async () => {
  const f = fixture(); try {
    const a = f.take('sending-a', 0, { trimStartSeconds: 1, trimEndSeconds: 10 });
    const b = f.take('unsent-b', 0, { isPrimary: false });
    f.ctx.videos = [a, b]; await approve(f);
    let release;
    f.ctx.uploadSegment = async (entry, signal, persistAttempt) => {
      persistAttempt({attemptId:f.ATTEMPT,requiredHeaders:null,expiresAt:null});
      f.sent.push(structuredClone(entry));
      await new Promise(resolve => { release = resolve; });
      return f.confirmation(entry);
    };
    const stop = transfer(f); await f.settle();
    const batchId = f.ctx.approvedBatch.id;
    f.invoke(`handleSwitchPrimary(0, ${JSON.stringify(b.id)})`);
    f.invoke(`updatePoolTake(0, ${JSON.stringify(a.id)}, {trimStartSeconds: 6})`);
    f.invoke('handleEditTakes(0)');
    f.invoke('startRetake(0)');
    await approve(f);
    Object.assign(f.ctx, { screen: 'question', phase: 'reviewTrim', questionIndex: 0 });
    assert.equal(f.invoke('canDeleteReviewTake()'), false);
    assert.throws(() => f.invoke(`handleDeleteTake(${JSON.stringify(a.id)})`));
    assert.equal(f.ctx.approvedBatch.id, batchId);
    assert.equal(f.ctx.videos.find(v => v.id === a.id).trimStartSeconds, 1);
    assert.equal(f.ctx.videos.find(v => v.id === a.id).isPrimary, true);
    assert.equal(f.ctx.retakeQuestionIndex, null);
    release(); await f.settle(); persist(f);
    assert.deepEqual(f.sent.map(v => v.video.id), [a.id]);
    assert.equal(f.sent[0].video.trimStartSeconds, 1);
    assert.ok(new f.File(b.filePath).exists, 'confirmation of A must preserve unsubmitted B');
    assert.ok(f.ctx.videos.some(v => v.id === b.id));
    assert.equal(f.ctx.isExactConfirmedTake(f.ctx.approvedBatch, b), false);
    assert.ok(!f.removed.includes(b.filePath));
    stop?.();
  } finally { f.clean(); }
});

test('legacy boolean-only session retains footage but cannot restore submission intent', async () => {
  const f = fixture(); try {
    const a = f.take('legacy-private-a'), b = f.take('legacy-private-b', 1);
    f.ctx.videos = [a, b]; persist(f);
    const file = f.ctx.accountFile('session-state.json');
    const legacy = JSON.parse(file.textSync());
    legacy.version = 2; legacy.uploadConfirmed = true; legacy.uploadedQuestionIndices = [0]; delete legacy.approvedBatch;
    file.write(JSON.stringify(legacy));
    const loaded = f.ctx.loadSession();
    assert.deepEqual(loaded.videos.map(v => v.id), [a.id, b.id]);
    assert.equal(loaded.uploadConfirmed, false);
    assert.equal(loaded.approvedBatch, null);
    f.invoke('restoreOwnedProgress(true, questions)'); transfer(f);
    assert.equal(f.sent.length, 0);
  } finally { f.clean(); }
});

test('late completion after account switch cannot checkpoint, mark or remove a newer account take', async () => {
  const f = fixture(); try {
    const a = f.take('old-account-a'); f.ctx.videos = [a]; await approve(f);
    let release;
    f.ctx.uploadSegment = async (entry, signal, persistAttempt) => { persistAttempt({attemptId:f.ATTEMPT,requiredHeaders:null,expiresAt:null}); await new Promise(resolve => { release = resolve; }); return f.confirmation(entry); };
    transfer(f); await f.settle();
    const count = f.checkpoints.length;
    f.ctx.activateAccount('synthetic-b');
    const b = { ...a, id: 'new-account-b', filePath: f.ctx.accountDirectory().uri + '/recordings/new-account-b.mp4' };
    const file = new f.File(b.filePath); file.create(); file.write('synthetic B private footage');
    Object.assign(f.ctx, { distributorId: 'synthetic-b', videos: [b], approvedBatch: null, hasSubmittedBatch: false });
    release(); await f.settle();
    assert.equal(f.checkpoints.length, count);
    assert.equal(f.ctx.hasSubmittedBatch, false);
    assert.equal(f.ctx.approvedBatch, null);
    assert.deepEqual(f.ctx.videos.map(v => v.id), [b.id]);
    assert.ok(file.exists); assert.equal(f.removed.length, 0);
  } finally { f.clean(); }
});

test('local primary selection refreshes the production library preview immediately', async () => {
  const f = fixture(); try {
    const a = f.take('preview-a'), b = f.take('preview-b', 0, { isPrimary: false });
    Object.assign(f.ctx, { videos: [a, b], screen: 'main', mainTab: 'myVideos', fetchSegments: async () => [], fetchRenderedVideos: async () => [] });
    f.effect('const answers = buildAnswerRows'); await f.settle();
    assert.equal(f.ctx.answerRows[0].play.filePath, a.filePath);
    f.invoke(`handleSwitchPrimary(0, ${JSON.stringify(b.id)})`);
    assert.equal(f.jsxProp('MyVideosScreen', 'answers')[0].play.filePath, b.filePath);
    await approve(f);
    assert.equal(f.ctx.approvedBatch.entries[0].video.id, b.id);
  } finally { f.clean(); }
});

test('acknowledging Q1 preserves Q2 kept during transfer even if the process stops before another render', async () => {
  const f = fixture(); try {
    const a = f.take('held-q1'); f.ctx.videos = [a]; await approve(f);
    let release;
    f.ctx.uploadSegment = async (entry, signal, persistAttempt) => {
      persistAttempt({attemptId:f.ATTEMPT,requiredHeaders:null,expiresAt:null});
      f.sent.push(structuredClone(entry));
      await new Promise(resolve => { release = resolve; });
      return f.confirmation(entry);
    };
    transfer(f); await f.settle();
    const b = f.take('kept-during-q1', 1);
    Object.assign(f.ctx, { questionIndex: 1, screen: 'question', phase: 'reviewTrim', takesByQuestion: { 1: [b] }, selectedTakeId: b.id });
    f.invoke('handleKeepTake()'); persist(f);
    assert.ok(f.ctx.loadSession().videos.some(video => video.id === b.id));
    release(); await f.settle();
    // Read the synchronous completion checkpoint before firing persistence
    // from a later render: this is the force-quit window under test.
    const stored = f.ctx.loadSession();
    assert.ok(stored.videos.some(video => video.id === b.id), 'old upload closure must not erase newly kept Q2 metadata');
    assert.deepEqual(f.sent.map(entry => entry.video.id), [a.id]);
    assert.ok(new f.File(b.filePath).exists);
  } finally { f.clean(); }
});

test('failed durable approval creates no in-memory permission and no transfer', async () => {
  const f = fixture(); try {
    const a = f.take('checkpoint-failure-a'); f.ctx.videos = [a];
    f.ctx.saveSession = () => { throw new Error('synthetic disk full'); };
    try { await approve(f); } catch {}
    transfer(f); await f.settle();
    assert.equal(f.sent.length, 0);
    assert.equal(f.ctx.uploadConfirmed, false);
    assert.equal(f.ctx.approvedBatch, null);
    assert.ok(new f.File(a.filePath).exists);
  } finally { f.clean(); }
});

test('a queued persistence effect from the pre-approval render cannot overwrite durable approval', async () => {
  const f = fixture(); try {
    const a = f.take('queued-checkpoint-a'); f.ctx.videos = [a];
    const stalePersist = f.captureEffect('const persistedScreen');
    await approve(f);
    const id = f.ctx.loadSession().approvedBatch.id;
    stalePersist();
    assert.equal(f.ctx.loadSession().approvedBatch?.id, id);
  } finally { f.clean(); }
});

test('restoring a partially confirmed multi-question batch skips only its exact acknowledged member', async () => {
  const f = fixture(); try {
    const a = f.take('partial-a'), b = f.take('partial-b', 1);
    f.ctx.videos = [a, b]; await approve(f);
    const batch = f.ctx.confirmBatchEntry(bindAttempt(f, f.ctx.approvedBatch, f.ctx.approvedBatch.entries[0].id), f.ctx.approvedBatch.entries[0].id, f.confirmation(f.ctx.approvedBatch.entries[0]));
    f.ctx.approvedBatch = batch; f.ctx.approvedBatchRef.current = batch; persist(f);
    f.ctx.videos = []; f.ctx.approvedBatch = null; f.ctx.approvedBatchRef.current = null;
    f.invoke('restoreOwnedProgress(true, questions)'); transfer(f); await f.settle();
    assert.deepEqual(f.sent.map(entry => entry.video.id), [b.id]);
    assert.equal(f.ctx.approvedBatch.status, 'completed');
    assert.equal(f.ctx.approvedBatch.entries[0].confirmation.segmentId, f.SEGMENT);
  } finally { f.clean(); }
});

test('a new explicit review excludes exact acknowledged Q1 and never labels unsent replacement B uploaded', async () => {
  const f = fixture(); try {
    const a = f.take('historical-a'), b = f.take('historical-unsent-b', 0, { isPrimary: false });
    f.ctx.videos = [a, b]; await approve(f); transfer(f); await f.settle();
    f.ctx.answerRows = [{ questionIndex: 0, label: 'Question 1', uploaded: true, play: { filePath: a.filePath }, takes: [] }];
    f.invoke('openUploadReview()');
    assert.equal(f.jsxProp('UploadingScreen', 'items').length, 0, 'already acknowledged exact A is not silently requeued');
    f.invoke(`handleSwitchPrimary(0, ${JSON.stringify(b.id)})`);
    const rows = f.jsxProp('MyVideosScreen', 'answers');
    assert.equal(rows[0].uploaded, false); assert.equal(rows[0].play.filePath, b.filePath);
    await approve(f);
    assert.deepEqual(Array.from(f.ctx.approvedBatch.entries, entry => entry.video.id), [b.id]);
    assert.equal(f.ctx.approvedBatch.entries[0].confirmation, null);
    assert.ok(new f.File(b.filePath).exists);
  } finally { f.clean(); }
});

test('failed transfer cancellation retains every take and requires fresh explicit approval', async () => {
  const f = fixture(); try {
    const a = f.take('cancel-failure-a'), b = f.take('cancel-unsent-b', 0, { isPrimary: false });
    f.ctx.videos = [a, b]; await approve(f);
    f.ctx.uploadSegment = async () => { throw new Error('synthetic offline'); };
    transfer(f); await f.settle();
    assert.ok(f.ctx.uploadError);
    f.invoke('cancelFailedBatch()'); persist(f);
    assert.equal(f.ctx.approvedBatch, null);
    assert.equal(f.ctx.loadSession().approvedBatch, null);
    transfer(f); await f.settle();
    assert.equal(f.sent.length, 0); assert.equal(f.removed.length, 0);
    assert.ok(new f.File(a.filePath).exists); assert.ok(new f.File(b.filePath).exists);
  } finally { f.clean(); }
});

test('malformed or tampered persisted snapshots never become upload authority', async () => {
  const f = fixture(); try {
    const a = f.take('malformed-entry');
    const original = await f.ctx.createApprovedBatch([a], f.ctx.questions, f.ctx.readUploadFileIdentity, {ownerId:f.OWNER,clientId:f.CLIENT});
    for (const mutate of [
      batch => { batch.entries[0].video.trimStartSeconds = -1; },
      batch => { batch.entries[0].file.md5 = 'changed'; },
      batch => { batch.entries[0].question.id = 'changed'; },
      batch => { batch.entries.push(structuredClone(batch.entries[0])); },
      batch => { batch.status = 'completed'; },
      batch => { batch.entries[0].confirmation = { confirmedAt: 'invalid' }; },
    ]) {
      const value = structuredClone(original); mutate(value);
      assert.equal(f.ctx.restoreApprovedBatch(value), null);
    }
    await assert.rejects(f.ctx.createApprovedBatch([{ ...a, trimStartSeconds: -1 }], f.ctx.questions, f.ctx.readUploadFileIdentity, {ownerId:f.OWNER,clientId:f.CLIENT}));
    await assert.rejects(f.ctx.createApprovedBatch([{ ...a, trimEndSeconds: 13 }], f.ctx.questions, f.ctx.readUploadFileIdentity, {ownerId:f.OWNER,clientId:f.CLIENT}));
    assert.throws(() => f.ctx.confirmBatchEntry(original, 'unapproved-entry', { confirmedAt: new Date().toISOString() }));
    // A delayed/out-of-order local acknowledgement is bound by entry ID.
    const b = f.take('out-of-order-b', 1);
    const pair = await f.ctx.createApprovedBatch([a, b], f.ctx.questions, f.ctx.readUploadFileIdentity, {ownerId:f.OWNER,clientId:f.CLIENT});
    const secondFirst = f.ctx.confirmBatchEntry(bindAttempt(f, pair, pair.entries[1].id), pair.entries[1].id, f.confirmation(pair.entries[1]));
    assert.equal(secondFirst.entries[0].confirmation, null);
    assert.ok(secondFirst.entries[1].confirmation);
    assert.equal(f.ctx.isExactConfirmedTake(secondFirst, a), false);
    assert.equal(f.ctx.isExactConfirmedTake(secondFirst, b), true);
  } finally { f.clean(); }
});

test('Home reports all sent only when every current primary has an exact acknowledgement', async () => {
  const f = fixture(); try {
    const a = f.take('home-sent-a'); f.ctx.videos = [a]; await approve(f); transfer(f); await f.settle();
    assert.equal(f.jsxProp('HomeScreen', 'hasSubmittedBatch'), true);
    const b = f.take('home-private-b', 1);
    Object.assign(f.ctx, { questionIndex: 1, screen: 'question', phase: 'reviewTrim', takesByQuestion: { 1: [b] }, selectedTakeId: b.id });
    f.invoke('handleKeepTake()');
    assert.equal(f.ctx.hasSubmittedBatch, true, 'historical successful batch still exists');
    assert.equal(f.jsxProp('HomeScreen', 'hasSubmittedBatch'), false, 'private final answer is not submitted by historical success');
    f.invoke('openUploadReview()'); await approve(f); transfer(f); await f.settle();
    assert.equal(f.jsxProp('HomeScreen', 'hasSubmittedBatch'), true);
    assert.deepEqual(f.sent.map(entry => entry.video.id), [a.id, b.id]);
  } finally { f.clean(); }
});
