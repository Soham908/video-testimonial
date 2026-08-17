# Session handoff — 2026-08-14

Working session summary for continuing on a different machine. This file is
meant to be read once on the new laptop and then folded away — durable
decisions belong in `DECISIONS.md`, durable engineering facts belong in
`DEV_NOTES.md`. Delete or consolidate this file once you've picked the
context back up (same pattern as the old `HANDOFF.md` that got folded into
`DEV_NOTES.md` earlier in this project — see git history).

## Repo state right now

- Branch: `feature/ui-revamp-v2` (not merged to `main`)
- Latest commit: `1d2d5f2` "temporary commit" — this absorbed the previous handoff's `AppFlow.tsx`/`CameraAlignment.tsx` bug fixes and this `HANDOFF.md` file itself. Those four bug fixes (see the Aug 14 section below) are therefore **committed now**, still pending the on-device verification this file already flagged for them.
- **Uncommitted right now** (`git status --short`):
  - `session.ts` (new file) + `AppFlow.tsx` — force-quit session-persistence work from the latest session, see the section below. Not committed because it's entirely unverified on-device (no testing has happened at all, not even manual).
  - `DECISIONS.md` — has raw scratch notes pasted at the very top (lines 3-7, the permission/back-button bug report) that were never filed into the LOCKED/OPEN structure. Still unresolved.
  - `.gitignore` — your own edit (adds `screenshots/`), predates all of this, still untouched/uncommitted. Not related to any of this work.
  - `.claude/` — local tool state (worktrees, settings), not meant to be committed, already gitignored territory conceptually.

**First thing to do on the new machine**: `git pull` (or however you're syncing the working tree across laptops — if it's not pushed anywhere, you'll need to bring the working tree over some other way, e.g. `git diff > session.patch` from this machine first). Then re-run `npx tsc --noEmit` to confirm the same clean state before doing anything else.

## Session update — 2026-08-17: force-quit session persistence (uncommitted, unverified)

Goal: the app's in-progress recording session should survive a force-quit at
any point and restore to a coherent state on relaunch, rather than resetting.
`CameraAlignment.tsx` and the CV/audio logic were explicitly off-limits for
this and were **not touched**.

**What was built:**

- **`session.ts` (new file)** — a small persistence module, same pattern as
  `myVideos.ts`'s sync cache: synchronous JSON read/write to a file in
  `Paths.document` via `expo-file-system`, no new dependency. Exports
  `saveSession` / `loadSession` / `clearSession`, plus:
  - `hasMeaningfulProgress()` — so a session file with no real progress
    (fresh install, never past onboarding) doesn't skip onboarding on
    restore.
  - `restorableQuestionPhase()` — collapses a persisted `'recording'` or
    `'countdown'` phase down to `'brief'` on restore, since a take only
    ever enters app state once `onRecordingFinished` has actually fired;
    an interrupted one was never restorable in the first place.
  - `purgeOrphanedRecordingTempFiles()` — deletes any leftover
    `VisionCamera_*.mp4` in the app's cache dir on restore, if the
    persisted phase shows a recording was interrupted mid-capture.
    **Android-only**: traced VisionCamera's Android recorder to
    `File.createTempFile("VisionCamera_", ".mp4")`, which resolves to the
    same cache dir `expo-file-system` exposes as `Paths.cache` — safe to
    scan and delete. iOS's recorder writes to `NSTemporaryDirectory` with a
    random UUID filename instead, a directory `expo-file-system` doesn't
    expose a handle to at all, so an orphaned iOS temp file can't be
    positively located from JS. It never leaks into app state either way;
    iOS documents `NSTemporaryDirectory` contents as system-purged
    (including "on next launch of the app that created them"), so it's
    still cleaned up, just not deterministically by us. **This is the one
    known, accepted gap** — flagging again here so it doesn't get
    rediscovered as a surprise.

- **`AppFlow.tsx`**:
  - A single consolidated `useEffect` persists question index, phase,
    retake state, `videos`, `takesByQuestion`, selected take, trim
    settings, `autoStart`, `hasSubmittedBatch`, upload-confirmed state, and
    per-video upload status — on every change to any of them, not just on
    screen transitions. Gated behind a new `sessionRestored` flag so it
    can't fire with default state and clobber a just-loaded session file
    before the launch-time restore has applied.
  - Launch-time restore runs after `restoreSession()` confirms the auth
    token, reapplying all of the above and routing to the right screen.
    One non-obvious edge case handled: the post-keep "Saved on your phone"
    popup doesn't reset `phase` away from `'reviewTrim'`, so a naive
    restore landing in that exact window could reopen an empty Review &
    Trim screen with nothing to show (the take was already moved into
    `videos` and cleared from `takesByQuestion`). Detected via
    `takesByQuestion[questionIndex]` being empty and routed to Home instead
    — the same place that popup's own "Home" button goes.
  - Upload tracking changed from a bare 0-1 progress fraction to
    `uploadedQuestionIndices: number[]` (also persisted) — a force-quit
    mid-upload now resumes only the videos not yet confirmed, instead of
    re-sending the whole batch. Reset to `[]` only when a *new* upload
    batch is started (Home's "Send all" / My Videos' "Upload all"), not on
    retry (retry should only redo what didn't finish).
  - `startNewSession()` (the dev-menu "reset everything" utility) now also
    calls `clearSession()` and resets the new upload-tracking state, so it
    stays a genuine full reset.

**Status: entirely unverified on-device.** Two blockers surfaced trying to
test this in the sandbox this was built in, worth knowing about for next
time this comes up:
1. The companion `testimonial-backend` repo has no `.env` here — needs a
   live Postgres + real S3/R2 (and ElevenLabs/Gemini/nexrender) secrets that
   don't exist in that environment.
2. More fundamentally: every one of the five checkpoints below requires at
   least one successfully recorded take first, which requires
   `CameraAlignment.tsx`'s face-alignment lock to actually fire (15-20
   consecutive good frames of a real, centered, well-lit face). That's a
   live-human-in-front-of-a-camera requirement, not a config gap — no
   amount of emulator/backend setup substitutes for it.

**On-device checklist for this specifically** (do this before trusting or
committing `session.ts` / the `AppFlow.tsx` diff):
1. Force-quit mid-recording → relaunch → lands on Question Brief for the
   same question; confirm via `adb shell run-as <package> ls cache/` (or
   equivalent) that no `VisionCamera_*.mp4` is left behind.
2. Force-quit on Review & Trim before tapping "Keep" → relaunch → same take
   selected, same trim/remove-last-2s settings.
3. Force-quit right after tapping "Keep this take" (including while the
   "Saved on your phone" popup is still up) → relaunch → the take is in My
   Videos, lands on Home not a broken review screen.
4. Force-quit on My Videos with recordings not yet uploaded → relaunch →
   same tab, same videos listed.
5. Force-quit mid-upload → relaunch → resumes rather than re-uploading
   already-confirmed segments.

## What this session covered, roughly in order

1. **Screen-by-screen design fidelity pass** — spawned a background agent that compared on-device screenshots against the Claude Design mockup export and fixed real gaps (Permissions screen rebuilt, Question Brief's missing sample-answer row, a `Chip` component bug that dropped pill styling, Upload flow row thumbnails, Profile's missing Consent row, etc.). Merged into this branch. Full punch list is in the commit `d690d12`.
2. **Backend sync check** — confirmed the UI revamp needed zero backend changes (upload is still individual per-video calls looped client-side, not a batch endpoint). Logged one real backend-adjacent item in `DECISIONS.md`: the pending 7-question restructure.
3. **Logout feature** — added to Profile screen, purely client-side (clears the stored JWT via the already-existing but previously-unused `auth.ts` `logout()`), no backend change needed.
4. **Docs cleanup** — retired `INTEGRATION_STEPS.md` (its work was done), migrated the two facts worth keeping into `DEV_NOTES.md`.
5. **Theme/palette iterations** — this went through several rounds as the user tried live options on-device. **Current final state**: 6 palettes in `theme/palettes.ts`:
   - `green` — "Green (original)", accent `#1E7A5A`
   - `ember` — "Ember (brighter, bolder)", accent `#C25A34` — **current default** (`DEFAULT_PALETTE_ID`)
   - `cobalt` — "Cobalt (bold, cool)", accent `#1F4FC4`
   - `paprika` — "Paprika (bold, warm)", accent `#B04424`
   - `emerald` — "Emerald (bold, cool)", accent `#0F7A5A`
   - `raspberry` — "Raspberry (bold, warm)", accent `#B32B5E`
   - Earlier explorations (Terracotta, Teal, Petrol, Sage teal, Mulberry) were tried and explicitly removed — don't resurrect them without asking, they were deliberately cut.
   - Backgrounds were lightened twice over during this session (`warmNeutrals`/`coolNeutrals` shared consts) based on live on-device feedback that colors read muted. If it still looks muted on the new machine, that's a "lighten again" ask, not a bug.
   - Switcher is `__DEV__`-only, top-right on every screen (`theme/PaletteSwitcher.tsx`) — reads live from `PALETTES`, no code changes needed to test a different default, just tap a swatch.
6. **Alignment fixes across the "entry cluster" screens** (Login, WhatsApp Invite, Identity Confirmation, Onboarding, Consent, Permissions) — went through two rounds. First round overcorrected (centered everything, which looked worse). Second round: Login/Invite/Identity/Consent now flow naturally top-down with the button following content directly (no forced centering, no bottom-pinning). Onboarding/Permissions/`ConfirmationScreen` keep a genuine bottom-anchored footer but via a new shared constant, `theme/spacing.ts`'s `spacing.footerBottom` (64px) — **use this constant for any new footer-button screen**, don't hand-roll padding again.
   - Onboarding also got real per-step illustrations (mini question card, phone/video-card mockup, WhatsApp-style chat bubble exchange) replacing a placeholder emoji.
   - Permissions' microphone icon was a plain pill blob with no recognizable shape — rebuilt as capsule+stem+base.
7. **Four frontend bugs fixed** (uncommitted — see "Uncommitted right now" above). These came from the user's own on-device testing, not from design-fidelity review:
   - **`startNewSession()` data-loss bug**: continuing into any question from Home used to wipe ALL previously recorded videos and reset to question 0. Fixed by splitting into `enterNextQuestion()` (the real flow, non-destructive, sets `questionIndex` to `videos.length`) vs. `startNewSession()` (kept only as an explicit dev-menu "reset everything" testing utility, moved to the Login screen's `__DEV__` menu).
   - **Uploading screen's tap-to-review**: `onReviewItem` prop existed on `UploadingScreen` but was never wired in `AppFlow.tsx`. Now wired to open the video player (plain playback, not a retake shortcut — `DECISIONS.md` explicitly rejects a change-take control at that screen).
   - **Android hardware back button**: was completely unhandled anywhere in the app (custom state machine, not React Navigation) — pressing back just closed the app from any screen. Added a `BackHandler` listener in `AppFlow.tsx` mapping back-press to "one step up" per screen/phase. Home falls through to the OS default (exits app) since there's nowhere higher to go.
   - **No way out of camera check/countdown/recording/review via back button**: first pass made these phases a silent no-op (deliberately, to avoid accidental exits). User pushed back on this — wanted a real way out. Added a confirm popup ("Stop and go back?") triggered by back-press in these phases; confirming discards an in-progress recording (`cameraRef.current?.cancelRecording()`) and returns to the Question Brief screen for that question.
   - **Permission hard-denial dead-end**: `CameraAlignment.tsx` had a real bug — its auto-request `useEffect` only re-fires when `hasCamera`/`hasMic` *change value*, so after a denial (both stay `false`) it never retries, and the screen was stuck forever on a static "Requesting camera & microphone permission…" message that wasn't actually requesting anything. Fixed with a "Try again" button (soft denial, OS will still show its dialog) vs. routing to `PermissionsScreen`'s already-built guided denied-state (hard denial — numbered Settings steps, much clearer for non-technical users than a bare button). **This is the one change in `CameraAlignment.tsx`** — every prior round of this project treated that file as untouchable (load-bearing CV/audio logic). The change is isolated to the permission-fallback view only, zero changes to face detection/alignment/audio — but it hasn't been verified on a real device by me, only reasoned through code. **Test this one specifically**: deny once → "Try again" should re-show the OS dialog; deny twice / "don't ask again" → should route to the full Permissions screen with the numbered guide.

## What needs on-device testing before committing/trusting

1. Permission denial flow (both soft and hard denial paths) — highest priority, touches the sensitive file.
2. Exit-confirm popup during an actual in-progress recording — confirm the take really gets discarded (temp file deleted), not left orphaned on disk.
3. Back-button behavior across every screen — the per-screen mapping in `AppFlow.tsx`'s `BackHandler` effect was a reasoned judgment call, not something visually verified.
4. General re-check of the alignment/palette/illustration changes from earlier in the session if that hasn't happened recently.

## Known remaining work (not started, or deliberately blocked)

- **7-question restructuring** (3 → branded reel, 4 → survey-only) — blocked on a decision from Soham's boss about whether the 3 reel-eligible questions become 3 separate reels or get combined into 1. Logged in `DECISIONS.md` OPEN section. Nothing to build yet.
- **Home "reels ready" state** (screen 18) — still just a placeholder, needs actual design thinking, not more generated options (per `DECISIONS.md`'s own process notes).
- **Profile edit persistence** — editing name/business/years only updates local mock state, nothing saved to a backend. Deferred, not urgent.
- **Not this repo, backend's own list**: dynamic composition duration truncating long answers (flagged as "actively destroying content today" — probably the single highest-severity item across either repo), crop/zoom on rendered output, branded template quality, caption styling, Gemini→Claude sentiment model swap. See `DECISIONS.md`'s "Known issues, fix pending" section.

## Architecture things worth knowing before touching code

- `AppFlow.tsx` is a hand-rolled state machine (`Screen`/`QuestionPhase` string unions + `useState`), not React Navigation. All navigation is `setScreen(...)`/`setPhase(...)` calls.
- `CameraAlignment.tsx` (+ `alignment.ts`, `useAlignmentLock.ts`, `useAmbientNoiseCheck.ts`) is the load-bearing camera/CV/audio logic — proven working on a physical device over many iterations. Treat as off-limits by default; the one exception this session was narrowly scoped (permission-fallback rendering only) and is called out explicitly above.
- Theme system: `theme/ThemeContext.tsx` (`useTheme()` hook) + `theme/palettes.ts` (palette definitions) + `theme/spacing.ts` / `theme/radius.ts` / `theme/typography.ts`. Every screen follows the same pattern: `const { colors, spacing, radius, typography } = useTheme()`, styles built via a `makeStyles(...)` function called through `useMemo`.
- `DECISIONS.md` is the single source of truth for product/design decisions (LOCKED/OPEN/REJECTED). `DEV_NOTES.md` is engineering gotchas/resolved-investigation history. Keep using both — don't create new scratch files for this kind of thing going forward (see the raw notes at the top of `DECISIONS.md` right now, which is exactly the anti-pattern to avoid — file things properly instead of leaving loose text at the top).

## Suggested next step on the new machine

Test the four uncommitted bug fixes on-device (see checklist above), then commit them. After that, the natural next thing is either a general polish/QA pass, or picking up one of the "known remaining work" items above — nothing is currently blocking mid-task.
