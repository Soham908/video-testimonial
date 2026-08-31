# Session handoff — 2026-08-31

Continuity doc for picking this up in a different chat session. Snapshot of
today's work, not a permanent project doc — fold the useful parts into
`DECISIONS.md`/`DEV_NOTES.md` once absorbed, same pattern as the previous
version of this file.

Repo state at time of writing: everything below is committed on
`feature/ui-revamp-v2` (not merged to `main`, not pushed to `origin` — ask
before pushing). The sibling backend repo (`C:\dev\testimonial-backend`) had
its own matching commit made in the same session; see its
`SESSION_HANDOFF.md` for that side.

## What got built today, roughly in order

1. **Capture pipeline pinned** (`CameraAlignment.tsx`) — 1080×1920, 30fps,
   3Mbps H.264 (was defaulting to whatever the device picked, ~14Mbps/98MB
   per minute). Logs the actually-negotiated format so odd devices can be
   diagnosed from field logs later.
2. **Capture metadata** (`deviceInfo.ts` new, `recordings.ts`, `upload.ts`) —
   file size/resolution/fps/codec/device model/OS version gathered at
   record-finish time, sent to `/segments/confirm` as an optional `capture`
   object. Backend stores it as-is (`Segment.capture_metadata`, JSONB).
3. **Reel-rendering feature flag** (`config.ts` new) —
   `EXPO_PUBLIC_ENABLE_REEL_RENDERING`, default off (backend's independent
   `ENABLE_REEL_RENDERING` mirrors this — **keep both in sync**, they don't
   read each other). When off: My Videos never calls
   `/rendered-videos`, hides the branded section entirely instead of
   showing its "will appear here" empty state, and the post-upload
   confirmation screen doesn't promise a reel notification that'll never
   come.
4. **Dynamic per-client questions** (`questions.ts` new) — removed
   `PLACEHOLDER_QUESTIONS`/`TOTAL_QUESTIONS`/talking-points/prompts
   entirely. Questions fetch after login from
   `GET /distributors/me/questions`, cache locally
   (`questions-cache.json`), show cached data immediately and refresh in
   the background; error only surfaces with no cache *and* a failed fetch.
   VO audio re-keyed from index (`question1.mp3`) to the backend's real
   question `id` (`q_<id>_en.mp3`) in `QuestionBriefScreen.tsx` — the 5
   bundled files are keyed to the *actual* seeded internal-test-client
   question ids (confirmed live against the running backend, not guessed).
   Session restore bounds-checks a resumed `questionIndex` against the
   current question count. `upload.ts` sends the real backend
   `question_index` per question (`questions[position].index`) instead of
   assuming `position + 1` — that assumption held for today's seed data but
   isn't guaranteed by the contract.
5. **My Videos bug fix** — a locally recorded (not-yet-uploaded) take never
   showed as recorded because the screen only read from confirmed server
   segments. Now merges local `videos` state with server segments so a kept
   take shows up immediately.
6. **Upload → Confirmation flow rework** (`UploadingScreen.tsx`,
   `ConfirmationScreen.tsx`, `AppFlow.tsx`) — the "your answers are on their
   way / keep your internet on" screen used to only appear *after* the
   upload had already finished, making that copy false. It now appears the
   moment you confirm, shows a live progress bar while actually sending,
   and switches to "Upload done" once it is. Also decoupled the upload
   effect from `screen` state entirely — "Back to Home" during upload no
   longer silently abandons whatever hasn't sent yet; it keeps running in
   the background (and survives a force-quit/relaunch) regardless of which
   screen is showing.

## Known gaps / things to verify next

- **Not tested on a real device this session** — everything above was
  verified via `tsc --noEmit` (clean) and against the live backend
  (`192.168.1.7:3000`) for the network-facing pieces, but no on-device
  recording/upload pass happened today. Do one before trusting the capture
  pipeline or the upload/confirmation flow changes in the field.
- **Talking points / on-screen recording prompts have no backend field.**
  `QuestionBriefScreen`'s "a good answer usually covers" section and
  `RecordingScreen`'s on-screen prompts both now degrade to empty — nobody
  designed a replacement, this is a real content gap, not a bug.
- **iOS device model is a real, permanent gap** (`deviceInfo.ts`) — core
  React Native exposes no device-model identifier on iOS at all (only
  `interfaceIdiom`), so `capture.device_model` degrades there. Android is
  fully populated (manufacturer + model + OS version/API level).
- **7-question restructuring** (3 → branded reel, 4 → survey-only) is still
  blocked on a decision from Soham's boss — unchanged from before. Worth
  noting: today's dynamic-questions work means the *count* is no longer a
  code blocker either way (nothing assumes 5 anywhere any more) — only the
  merged-vs-separate-reels product decision is still open.
- **Two independent `ENABLE_REEL_RENDERING` flags** (frontend
  `EXPO_PUBLIC_ENABLE_REEL_RENDERING`, backend `ENABLE_REEL_RENDERING`)
  don't validate against each other. If someone flips one without the
  other, the symptom is subtle (e.g. frontend polls for reels that the
  backend will never render, or vice versa) — worth a periodic manual check
  until/unless this becomes one real config source.

## What to do first in a new chat session

- `git log -1` to confirm you're looking at today's commit, then read this
  file plus the backend's `SESSION_HANDOFF.md` for the fuller narrative
  (design reasoning, what was checked, what was explicitly deferred).
- If continuing the security audit work (dev-endpoint gating, ownership
  checks) — that all landed backend-side today; see that repo's handoff for
  what's left there (nothing frontend-side was needed for it, per the
  original ask).
- If picking up an on-device verification pass: record 60 seconds on an
  Android device and check file size (should be ~20-24MB, not ~98MB), that
  My Videos shows the take before upload, and that the upload/confirmation
  screen shows live progress rather than jumping straight to "done."
