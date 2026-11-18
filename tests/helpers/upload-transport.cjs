const assert = require('node:assert/strict');
const {fixture}=require('./appflow-upload.cjs');

function transportFixture(options) {
  const f = fixture(options), requests = [], puts = [], durableAttempts = [];
  const upload = f.load('upload.ts');
  let sourceExists = false, serverAccepted = false, intent = null, batch = null;
  const envelope = (accepted = serverAccepted, withUpload = true) => ({ contract_version: 2, attempt_id: f.ATTEMPT,
    state: accepted ? 'accepted' : 'awaiting_upload', intent: structuredClone(intent),
    upload: accepted || !withUpload ? null : { upload_url: 'https://synthetic.invalid/write-once', expires_at: new Date(Date.now() + 300000).toISOString(),
      required_headers: { 'Content-Type':'video/mp4', 'Content-Length':String(intent.source_size_bytes), 'If-None-Match':'*', 'x-amz-checksum-sha256':Buffer.from(intent.source_sha256,'hex').toString('base64') } },
    receipt: accepted ? f.confirmation(batch.entries[0]).receipt : null });
  f.api.apiGet = async (endpoint, signal) => {
    requests.push({method:'GET',endpoint,signal});
    if (endpoint.endsWith('upload-capabilities')) return {contract_version:2,intake_enabled:true,immutable_attempts:true,sha256:true,write_once:true,selected_playback:true,legacy_writes_allowed:false,limits:{source_size_bytes:268435456,duration_ms:180000}};
    return envelope(serverAccepted, false);
  };
  f.api.apiPost = async (endpoint, body, signal) => {
    requests.push({method:'POST',endpoint,body:structuredClone(body),signal});
    if (endpoint === '/segments/upload-attempts') { intent = structuredClone(body); return envelope(); }
    assert.ok(endpoint.endsWith('/confirm'));
    if (!sourceExists) throw new f.api.ApiError(404, 'video_not_found');
    serverAccepted = true; return envelope(true, false);
  };
  f.File.prototype.upload = async function(url, options) {
    assert.ok(durableAttempts.length > 0, 'attempt is durable before native PUT');
    puts.push({path:this.uri,url,options}); sourceExists = true; return {status:200};
  };
  const approve = async video => {
    batch = await f.ctx.createApprovedBatch([video], f.ctx.questions, upload.readUploadFileIdentity, {ownerId:f.OWNER,clientId:f.CLIENT});
    return batch.entries[0];
  };
  const checkpoint = attempt => {
    batch = f.ctx.checkpointBatchAttempt(batch, batch.entries[0].id, attempt);
    durableAttempts.push(structuredClone(attempt));
  };
  return {...f, requests,puts,durableAttempts,upload,approve,checkpoint,envelope,
    entry:()=>batch.entries[0], batch:()=>batch,
    putExists:()=>{sourceExists=true;},
    setAccepted:()=>{sourceExists=true;serverAccepted=true;},
    transfer:signal=>upload.uploadSegment(batch.entries[0],signal,checkpoint),
  };
}
module.exports = {transportFixture};
