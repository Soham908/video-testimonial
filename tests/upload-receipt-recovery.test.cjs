const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { fixture } = require('./helpers/appflow-upload.cjs');

const checkReceipts = f => f.invoke('reconcilePendingUploadReceipts(new AbortController().signal)');
const transfer = f => f.effect('await uploadSegment(');

function restart(f) {
  f.ctx.approvedBatchRef.current = null;
  f.ctx.pendingUploadReceiptsRef.current = [];
  Object.assign(f.ctx, { videos: [], takesByQuestion: {}, approvedBatch: null, pendingUploadReceipts: [], uploadError: null });
  f.invoke('restoreOwnedProgress(true, questions)');
}

function slowUpload(f) {
  const requests = [];
  const puts = [];
  let entry, state = 'awaiting_upload', serverReceipt = null;
  const envelope = () => ({ contract_version: 2, attempt_id: f.ATTEMPT, state, intent: entry.intent, upload: null, receipt: serverReceipt });
  f.ctx.uploadSegment = f.load('upload.ts').uploadSegment;
  f.api.apiPost = async (endpoint, payload) => {
    requests.push(['POST', endpoint]);
    if (endpoint.endsWith('/confirm')) {
      assert.equal(f.ctx.loadSession().approvedBatch.entries[0].attempt.confirmationRequested, true, 'confirm intent is durable before request');
      assert.equal(puts.length, 1);
      state = 'validating';
      return envelope();
    }
    assert.equal(endpoint, '/segments/upload-attempts');
    entry = f.ctx.approvedBatch.entries[0];
    assert.deepEqual(payload, entry.intent);
    return { ...envelope(), created: true, upload: {
      upload_url: 'https://synthetic.invalid/write-once',
      required_headers: {
        'Content-Type': 'video/mp4', 'Content-Length': String(payload.source_size_bytes), 'If-None-Match': '*',
        'x-amz-checksum-sha256': Buffer.from(payload.source_sha256, 'hex').toString('base64'),
      },
      expires_at: new Date(Date.now() + 180000).toISOString(),
    } };
  };
  f.api.apiGet = async endpoint => {
    requests.push(['GET', endpoint]);
    if (endpoint.endsWith('/upload-capabilities')) return {
      contract_version: 2, intake_enabled: true, immutable_attempts: true, sha256: true, write_once: true,
      selected_playback: true, legacy_writes_allowed: false, limits: { source_size_bytes: 268435456, duration_ms: 180000 },
    };
    return envelope();
  };
  f.File.prototype.upload = async function(_url, { headers }) {
    assert.equal(headers['If-None-Match'], '*');
    assert.equal(headers['x-amz-checksum-sha256'], createHash('sha256').update(this.textSync()).digest('base64'));
    puts.push(this.uri);
    return { status: 200 };
  };
  return {
    puts, requests,
    accept() { state = 'accepted'; serverReceipt ??= f.confirmation(entry).receipt; return serverReceipt; },
    expire() { state = 'rejected'; },
  };
}

async function timeOutAfterConfirm(f, videos) {
  f.ctx.videos = videos;
  f.ctx.screen = 'uploading';
  await f.invoke('approveUpload()');
  transfer(f);
  for (let tick = 0; !f.ctx.uploadError && tick < 150; tick++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.match(f.ctx.uploadError, /still checking/);
}

const fastTimers = { setTimeout: callback => setTimeout(callback, 0) };

test('cancel and relaunch preserve a late receipt and every take with exactly one PUT and one confirm', async () => {
  const f = fixture(fastTimers);
  try {
    const service = slowUpload(f);
    const first = f.take('sent-before-cancel');
    const alternate = f.take('private-alternate', 0, { isPrimary: false });
    const later = f.take('cancelled-before-send', 1);
    await timeOutAfterConfirm(f, [first, alternate, later]);
    f.invoke('cancelFailedBatch()');
    const saved = f.ctx.loadSession();
    assert.equal(saved.approvedBatch, null);
    assert.equal(saved.pendingUploadReceipts.length, 1);
    assert.equal(saved.pendingUploadReceipts[0].intent.take_id, first.id);
    assert.equal(saved.pendingUploadReceipts[0].attempt.attemptId, f.ATTEMPT);

    restart(f);
    transfer(f);
    await checkReceipts(f);
    assert.equal(f.ctx.loadSession().pendingUploadReceipts.length, 1);
    assert.deepEqual(Array.from(f.jsxProp('UploadingScreen', 'items'), x => x.questionIndex), [1]);
    const stalePersistence = f.captureEffect('const persistedScreen');
    const receipt = service.accept();
    await checkReceipts(f);
    stalePersistence();
    await checkReceipts(f);
    assert.equal(f.ctx.loadSession().pendingUploadReceipts.length, 0);
    restart(f);
    transfer(f);
    assert.equal(f.ctx.hasExactAcknowledgement(f.ctx.videos.find(x => x.id === first.id)), true);
    assert.equal(f.ctx.videos.find(x => x.id === first.id).uploadAcknowledgement.receipt.receipt_id, receipt.receipt_id);
    assert.equal(f.ctx.videos.some(x => x.id !== first.id && x.uploadAcknowledgement), false);
    assert.deepEqual(Array.from(f.jsxProp('UploadingScreen', 'items'), x => x.questionIndex), [1]);
    assert.deepEqual(service.puts, [first.filePath]);
    assert.deepEqual(service.requests.filter(([method]) => method === 'POST'), [
      ['POST', '/segments/upload-attempts'], ['POST', '/segments/upload-attempts/' + f.ATTEMPT + '/confirm'],
    ]);
    for (const video of [first, alternate, later]) assert.ok(new f.File(video.filePath).exists);
  } finally { f.clean(); }
});

test('an interrupted cancellation checkpoint restores takes and keeps the old attempt in read-only recovery', async () => {
  const f = fixture(fastTimers);
  try {
    const service = slowUpload(f), first = f.take('last-good-take'), later = f.take('unsent-take', 1);
    await timeOutAfterConfirm(f, [first, later]);
    const write = f.File.prototype.write;
    f.File.prototype.write = function(value) {
      write.call(this, value.slice(0, 24));
      throw new Error('interrupted manifest write');
    };
    try { f.invoke('cancelFailedBatch()'); } finally { f.File.prototype.write = write; }
    assert.equal(f.ctx.uploadError, 'interrupted manifest write');
    restart(f);
    assert.equal(f.ctx.approvedBatch, null);
    assert.equal(f.ctx.pendingUploadReceipts.length, 1);
    assert.deepEqual(Array.from(f.ctx.videos, x => x.id), [first.id, later.id]);
    service.accept();
    transfer(f);
    await checkReceipts(f);
    assert.equal(f.ctx.hasExactAcknowledgement(f.ctx.loadSession().videos[0]), true);
    assert.deepEqual(service.puts, [first.filePath]);
    assert.equal(service.requests.filter(([method]) => method === 'POST').length, 2);
  } finally { f.clean(); }
});

test('an expired detached attempt releases the question for fresh approval and keeps the local recording', async () => {
  const f = fixture(fastTimers);
  try {
    const service = slowUpload(f), take = f.take('restored-after-expiry');
    await timeOutAfterConfirm(f, [take]);
    f.invoke('cancelFailedBatch()');
    await f.invoke('approveUpload()');
    assert.equal(f.ctx.approvedBatch, null);
    assert.match(f.ctx.uploadError, /earlier upload/);
    service.expire();
    await checkReceipts(f);
    assert.equal(f.ctx.loadSession().pendingUploadReceipts.length, 0);
    await f.invoke('approveUpload()');
    assert.equal(f.ctx.approvedBatch.entries[0].video.id, take.id);
    assert.equal(f.ctx.approvedBatch.entries[0].attempt, null);
    assert.equal(service.puts.length, 1);
    assert.ok(new f.File(take.filePath).exists);
  } finally { f.clean(); }
});

test('late receipt for the previous account cannot change the next account’s state', async () => {
  const f = fixture(fastTimers);
  try {
    const service = slowUpload(f), take = f.take('account-a');
    await timeOutAfterConfirm(f, [take]);
    f.invoke('cancelFailedBatch()');
    service.accept();
    const get = f.api.apiGet;
    let release;
    f.api.apiGet = async (...args) => {
      const response = await get(...args);
      await new Promise(resolve => { release = resolve; });
      return response;
    };
    const waiting = checkReceipts(f);
    await f.settle();
    f.ctx.activateAccount('account-b');
    release();
    await waiting;
    assert.equal(f.ctx.loadSession(), null);
    f.ctx.activateAccount(f.OWNER);
    assert.equal(f.ctx.loadSession().pendingUploadReceipts.length, 1);
    assert.equal(f.ctx.loadSession().videos[0].uploadAcknowledgement, undefined);
    assert.equal(service.puts.length, 1);
  } finally { f.clean(); }
});

test('a saved version 4 attempt without a dispatch marker remains recoverable on cancellation', async () => {
  const f = fixture();
  try {
    const video = f.take('saved-by-build-8');
    f.ctx.videos = [video];
    await f.invoke('approveUpload()');
    const file = f.ctx.accountFile('session-state.json');
    const old = JSON.parse(file.textSync());
    old.version = 4;
    delete old.checkpoint;
    delete old.pendingUploadReceipts;
    old.approvedBatch = f.ctx.checkpointBatchAttempt(old.approvedBatch, old.approvedBatch.entries[0].id,
      { attemptId: f.ATTEMPT, requiredHeaders: null, expiresAt: null });
    file.write(JSON.stringify(old));
    restart(f);
    assert.equal(f.ctx.approvedBatch.entries[0].attempt.attemptId, f.ATTEMPT);
    f.invoke('cancelFailedBatch()');
    assert.equal(f.ctx.loadSession().pendingUploadReceipts[0].attempt.attemptId, f.ATTEMPT);
    assert.ok(new f.File(video.filePath).exists);
    assert.equal(f.sent.length, 0);
  } finally { f.clean(); }
});
