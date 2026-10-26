# Focused fix prompts

Companion to `AUDIT_REPORT.md`, audited at commit `65375b2dd8d702854b53639133663ab4decb2fc1` on 2026-10-01. There are no substantiated Critical findings. Each of the four High findings has one self-contained prompt below.

Run these as separate implementation tasks. F01 and F04 touch the same bootstrap/persistence boundary: land F01 first, then adapt F04 to that owner-aware storage design. Re-read current code rather than assuming audit line numbers are unchanged. These are future fix instructions; the audit itself made no source changes.

## F01 — Isolate local recordings and asynchronous work by account

```text
Fix only the cross-account local-data exposure in C:\dev\video-testimonial.

Context: this is a React Native 0.86 / React 19.2.3 / Expo 57 app. It records
distributor video answers locally, then manually uploads selected takes via
API-issued presigned URLs. Read AGENTS.md and the current source. Keep existing
unfinished recordings recoverable for their rightful owner. Do not call a
production API or use real credentials/media in tests.

Verified defect:
- AppFlow.tsx handleLogout (audit lines 1363-1368) clears token/profile but leaves
  videos, pending takes, questions, library rows, and upload state in memory.
- handleAuthenticated (1399-1417) changes identity without detaching those data.
- session.ts has one session-state.json and no client/distributor owner.
- Startup directly restores stored.videos (AppFlow 504-575), and My Videos
  merges local footage even if the new account has no server segments.
- upload.ts obtains a new URL and confirms using the current account token.
  Consequently B can watch and explicitly upload A's recordings as B. This
  needs no backend IDOR: B uses a valid B-owned URL to submit the wrong bytes.
- Consent is checked only in the no-meaningful-progress restore branch. An
  unconsented B can restart with inherited progress and bypass onboarding.
- Late old-account requests can mutate the new account: profile/question
  callbacks are not identity-bound, and api.ts invokes its session-expired
  handler for an old request's 401 after a new token has been installed.

Implement a coherent account boundary, scoped to this issue:
1. Use both authenticated clientId and distributorId as local ownership.
   Namespace/associate session manifests, recordings, question and VO caches,
   and server-version sync metadata with that owner.
2. Detach all account-scoped UI/session state on logout/account transition.
   Retaining A's files is allowed; exposing them to B is not. Preserve ordinary
   device-only preferences separately where appropriate.
3. Invalidate/cancel pending work using an auth generation or equivalent. Bind
   uploads to an immutable owner, and prevent a later PUT/confirm continuation
   from switching credentials or updating a new session. Do not claim to revoke
   an already-issued presigned URL; correctly stop application continuation.
4. Restore only a matching owner's data after authentication. Quarantine legacy
   ownerless manifests safely; never infer ownership from the next login or
   silently delete recordings. Explain a minimal recovery/migration strategy.
5. Enforce that account's consent gate independently before restoring any
   record/upload-capable screen. Handle logout SecureStore failures explicitly.
6. Never overwrite a preserved manifest with empty unauthenticated UI state;
   avoid worsening the separate F04 bootstrap bug while making this change.

Verification (mock APIs/storage, no real backend):
- A records kept and pending takes with trims, logs out; B logs in and sees no
  A footage, questions, library rows, upload progress, or consent state.
- B's upload path never receives A's file URI. Returning to A restores A.
- Repeat across restart and with two distributors in different clients.
- Delay profile, question, upload, and 401 responses from A until B is active;
  they must not mutate or expire B or confirm A work with B credentials.
- New B cannot reach recording by restarting during onboarding/consent.
- Existing ownerless files are preserved but not assigned to B.
- Normal same-account restore and upload still work.

Add narrowly targeted regression coverage using the repository's current test
conventions; if none exist, introduce the smallest maintainable harness needed
for these state/identity invariants. Run TypeScript with no emit and relevant
tests. Report actual checks and remaining device QA. Do not redesign unrelated
camera, trimming, or screen styling, and do not deploy or commit automatically.
```

## F02 — Keep rehearsal out of the recording state machine

```text
Fix only the rehearsal-to-real-recording transition in
C:\dev\video-testimonial. Read AGENTS.md and current AppFlow.tsx,
CameraAlignment.tsx, and screens/RehearseScreen.tsx. This is Expo57 / RN0.86 /
VisionCamera5.1, not VisionCamera4.

Verified defect: autoStart defaults to true (AppFlow audit line308). Selecting
Rehearse sets phase='rehearse' (1764), but rehearsal shares the mounted
CameraAlignment with cameraCheck/countdown/recording. That component is always
alignmentActive, and its onLocked callback (1894-1898) unconditionally sets
phase='countdown' when autoStart is true. Countdown then starts the native
recorder (1015-1018). The user can finish and persist this as a normal take
without ever pressing 'Record for real'. The transition is visible, not covert,
and upload is still separately confirmed, but rehearsal's no-save promise is
broken.

Change only the phase boundary and related passive-rehearsal behavior:
- A camera alignment/noise callback may advance into countdown only while the
  current phase is cameraCheck for the current attempt.
- Rehearsal may show a camera preview/passive guidance but cannot initialize,
  start, finalize, or persist a real video take through automatic callbacks.
- 'Record for real' explicitly enters a fresh camera check/reset cycle.
- Keep the continuously mounted camera where appropriate and preserve ordinary
  auto-start/manual-start and permission behavior outside rehearsal.
- Account for stale callbacks after a phase transition; a stale lock event
  must not start a recording from rehearsal or an exited screen.

Add regression coverage with a mocked CameraAlignment/native recorder:
1. Enter rehearsal with autoStart=true; emit alignment/noise lock events and
   advance timers. Phase stays rehearsal and recorder/persistence are untouched.
2. Repeat with autoStart=false and with the rehearsal completion popup open.
3. Exit rehearsal; late callbacks do nothing.
4. Press 'Record for real'; fresh camera checks run, then normal countdown and
   capture work. Manual start still works with autoStart disabled.

Use mocked data and no production calls. Run TypeScript with no emit and the
targeted tests; document physical-device QA still needed. Do not combine this
with unrelated audio sequencing, UI redesign, or backend changes. Do not deploy
or commit automatically.
```

## F03 — Show Recording only after native capture starts

```text
Fix only recorder start/stop failure handling in C:\dev\video-testimonial.
Read AGENTS.md and current AppFlow.tsx and CameraAlignment.tsx. Installed stack
at audit: Expo57, RN0.86, VisionCamera5.1. Use the installed v5 interfaces/native
semantics, not examples for v4.

Verified defect: AppFlow countdown completion (audit lines1014-1018) invokes
cameraRef.current?.startRecording().catch(console.error) and immediately enters
phase='recording'. CameraAlignment (402-413) awaits createRecorder and start.
VisionCamera5.1 Android HybridVideoRecorder.kt (89-98) rejects the start promise
for failures before the Start event, rather than invoking onRecordingError.
The existing handleRecordingError callback (AppFlow1264-1272) therefore does
not recover these failures. A null camera/createRecorder rejection can leave
the visible timer running with no captured video. Stop rejection at1939-1941
also only logs; repeated finish presses are not gated.

Implement truthful, recoverable capture lifecycle:
- Explicitly distinguish starting, successfully recording, and stopping.
- Require a non-null ready handle and await successful native start before
  showing the recording indicator/elapsed timer.
- Route creation/start promise failures and native runtime errors through one
  guarded user-visible recovery path. Preserve already saved/pending takes.
- Handle stop rejection and prevent duplicate start/finish operations.
- Associate asynchronous completion with the current attempt; exiting during
  delayed start/stop cannot revive a discarded attempt or save an unintended
  take. Release/cancel native resources safely as required by v5 semantics.
- Keep the existing successful capture, durable-file move, review, and explicit
  upload behavior. Do not pretend a rejected start was a completed recording.

Regression coverage (mock native calls, no production traffic):
1. Missing camera ref; createRecorder rejection; startRecording rejection
   without onRecordingError. No false Recording state/timer, actionable retry.
2. Native runtime error after successful start still follows recovery once.
3. Delayed successful start followed by exit/unmount; no stale phase revival.
4. Stop rejection, duplicate finish taps, and successful normal finish; exactly
   one valid take appears only after native finalization.
5. Existing takes/trims survive all failure cases, and a retry records normally.

Add only focused regression infrastructure if the repo still has no tests.
Run the relevant tests and TypeScript with no emit. Report actual outcomes and
device QA needed for low-storage/encoder/mic-interruption cases. Do not change
backend APIs, unrelated UI, or the separate full-VO-before-countdown behavior.
Do not deploy or commit automatically.
```

## F04 — Preserve pending recordings across failed authentication/bootstrap

```text
Fix only destructive startup/session persistence in C:\dev\video-testimonial.
Read AGENTS.md and current auth.ts, session.ts, AppFlow.tsx, and preferences.ts.
Audit stack: Expo57 / SecureStore57.0.1 / FileSystem57.0.0 / React19.2.3.
If F01 account-scoped storage has landed, preserve and use that design.

Verified failure chain:
- auth.ts getCurrentAuth (audit63-69) catches every error, including offline/503,
  and returns null. restoreSession (80-85) then deletes the saved token.
- AppFlow startup (482-487) marks sessionRestored=true and returns on null auth,
  before the only loadSession call at504.
- Initial videos=[] and takesByQuestion={} are then persisted by608-643, even
  while the login/onboarding screen is displayed. session.ts60 overwrites the
  one manifest with those defaults.
- handleAuthenticated (1399-1417) does not restore recording state later.
- Actual-source in-memory checks starting with one kept unsent clip plus one
  pending take reproduced manifest loss for offline, HTTP503, HTTP401, and no
  stored token. Video bytes remain on disk, but the app has no recovery scan.

Implement safe bootstrap and recovery, without broad refactoring:
1. Distinguish confirmed invalid/expired auth from transient network/server/
   parsing/storage failure; do not delete valid credentials for an outage.
2. Separate completion of authentication checks from successful hydration of
   an owned recording session. Never overwrite an unread preserved manifest
   with defaults merely to leave the loading screen or display login.
3. Preserve pending manifests/media through confirmed expiry or missing tokens
   too. Reauthentication is not permission to discard unfinished recordings.
4. Share owner-safe hydration between cold restore and successful fresh login,
   so the same account recovers kept takes, pending takes, trim choices, and
   completed-upload checkpoints after login.
5. Handle optional preference/bootstrap storage rejection with retryable UI
   without falsely marking media hydrated. Do not introduce an endless spinner.
6. Never expose another account's files or trust an ownerless manifest simply
   because it exists. Keep backend authorization intact during offline recovery.

Add targeted regression checks with mocked storage/API and a pre-existing
manifest containing kept and pending takes, per-take trims and upload checkpoints:
- Offline,503,401,missing token,SecureStore failure: old manifest/media remain
  unchanged; transient auth failures do not delete the token.
- Reconnect and authenticate the same account: recover all recorded state.
- A different account cannot see or upload the preserved footage.
- Normal authenticated cold restore, new install, deliberate logout, consent
  gating, and completed-upload restore still behave correctly.
- Verify no transient render writes default state over a still-unread manifest.

Use actual source paths in regression tests and no real credentials/services.
Run TypeScript with no emit and relevant tests. Report what passed and any
remaining device checks. Do not combine this fix with multipart uploads, broad
navigation redesign, or unrelated camera/trim work. Do not deploy or commit
automatically.
```
