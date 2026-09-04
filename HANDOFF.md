# Session handoff — 2026-09-04

Continuity doc for picking this up on a different machine/chat session.
Snapshot of where things stand, not a permanent project doc — fold the
useful parts into `DECISIONS.md`/`DEV_NOTES.md` once absorbed, same pattern
as the previous version of this file (2026-09-01, superseded by this one).

Repo state at time of writing: everything through the 2-take-cap feature
below is committed and pushed to `feature/ui-revamp-v2` on `origin`. If
`git log` shows commits after this file's last entry that this doc doesn't
mention, trust `git log` — this file can go stale the moment someone
continues past it.

## What's landed since the last handoff (2026-09-01), briefly

Full detail is in each commit's own message - `git log --oneline` on this
branch. Compressed pointer list, newest first:

- **2-take-cap keeping** (this session, detailed below) - up to 2 takes can
  now be kept per question instead of forced-down-to-1, with a take picker
  in My Videos.
- **Phone+password self-registration** - `SelfRegisterScreen.tsx` is one
  screen with a register/sign-in mode toggle (`POST /register` now requires
  phone+password, not just name; new `POST /login/phone`). Backend-driven
  409 (`phone_already_registered`) auto-switches the screen into sign-in
  mode rather than showing a generic error.
- **VO player crash fix** - `CameraCheckScreen.tsx`'s `player.pause()`
  could run after `expo-video`'s own unmount-triggered release of the
  native player, throwing "shared object already released" synchronously.
  Fixed with the same `try/catch`-around-native-calls pattern
  `useAmbientNoiseCheck.ts` already used for `AudioRecorder`.
- **Countdown timing** - the VO-safety buffer moved from a visible hold on
  "1" (looked like a stall) to padding the *first* tick instead (5 shown
  300ms longer, invisible). See `COUNTDOWN_BUFFER_MS`'s comment in
  `AppFlow.tsx` for the exact numbers this is tuned against.
- **Android nav bar hidden during cameraCheck/countdown/recording** -
  `theme/NavigationBarSync.tsx`'s `useHideNavigationBarWhile` - the OS's
  own contrast scrim can't be recolored (`expo-navigation-bar`'s
  background-color API was removed in this SDK), only hidden outright.
- **Tap-outside-to-dismiss-keyboard** on every screen with a `TextInput`,
  plus the shared `PopupSheet` component (covers any future popup-based
  form for free).
- **VO local caching + staleness detection** (`voCache.ts`) - downloads
  each question's VO once, and now re-downloads automatically when the
  backend's `updated_at` on that question changes (mirrors `myVideos.ts`'s
  segment/rendered-video sync-cache pattern), instead of relying on a
  manual dev-menu cache clear.

## What got built today: keeping up to 2 takes per question

**The ask**: instead of forcing a distributor down to exactly 1 take the
moment they finish recording, let them keep up to 2 and decide which one
represents their answer later, from My Videos — right up until upload.

**Why this doesn't need a backend change**: upload was already deferred
and batched (only fires on "Upload videos", not per-take) - confirmed
before building anything. The backend still only ever receives exactly one
video per question either way; the second take is a purely local,
pre-upload convenience. This was clarified mid-session after an initial
wrong assumption (that keeping 2 takes would mean uploading 2 - it
doesn't, `uploadSegment` is still called once per question, filtered to
`isPrimary` takes only).

**Files touched**: `recordings.ts` (`RecordedVideo` gained `isPrimary?`
and per-take `trimStartSeconds?`/`trimEndSeconds?`/
`removeLastTwoSeconds?` - trim used to be flow-level flat state, now lives
directly on each take object, which is also what fixed a separate bug:
switching the previewed take in Review & Trim used to silently discard
whatever trim you'd set on the take you switched away from), `session.ts`
(persisted shape: dropped the flat trim fields, added `keptTakeIds?`),
`AppFlow.tsx` (the core state machine - see `reviewPoolFor()`,
`updatePoolTake()`, `handleKeepTake()`, `handleToggleKept()`,
`handleSwitchPrimary()`, and the new `primaryVideos` derived value used
everywhere `videos.length` used to mean "questions answered"),
`ReviewTrimScreen.tsx` (take-picker checkboxes, only shown once the
combined pool - existing saved takes + this session's fresh ones - exceeds
2), `MyVideosScreen.tsx` (this is also where "Option C" from the design
exploration landed for real - truncated question text that expands in
place, a take-switcher, real question text on every row, which it never
had before this), `RetakeConfirmOverlay.tsx` (copy fix - it used to
promise "your current answer will be replaced," no longer always true).

**Known open question, not yet resolved with Soham**: a plain single
retake (1 existing take → record exactly 1 new one, pool size 2) currently
defaults to **keeping both** rather than replacing - the new one becomes
primary automatically (so nothing looks different from My Videos unless
you open the expand panel), the old one just sticks around as a switchable
option until upload. This was a judgment call made to avoid forcing a
decision on the common case, not an explicit ask - flagged to Soham at the
end of the session, verbal "fairly decent" but this specific behavior
wasn't separately confirmed. If it should instead cleanly replace by
default (old behavior) and only pair up once there are genuinely 3+
candidates, that's a small change scoped to `handleKeepTake`'s
`pool.length <= 2` branch.

## Not yet built - discussed and designed, but no code

- **Language selection UI** - Settings' "Language" row is still a static
  display, no picker. Design agreed: local-only override (backend has no
  write-back for `language_pref` yet, only the per-call `?language=`
  query override on `/distributors/me/questions`), 3-language picker shown
  in-script (English/हिन्दी/मराठी), re-fetch+re-cache VO immediately on
  switch. Not started.
- **Multi-language VO cache key gap** - `voCache.ts` keys cached audio
  files by `questionId` only, not `(questionId, language)`. Real gap if
  the language picker above ever ships without this fix first - a language
  switch would silently keep playing whichever language got cached first.
- **VO/countdown sequencing gap (audio bleed, not crash)** - recording can
  still start a render cycle or two before the read-aloud VO is fully
  paused, so the mic could theoretically catch a sliver of VO tail. The
  crash this used to cause is fixed (see above); this specific audio-bleed
  timing gap is separate and still open. A real fix would pause the VO
  player synchronously the instant the countdown reaches zero, before
  calling `startRecording()` - marked with a comment in `AppFlow.tsx`
  where this would go.

## What to do first in a new chat session

- `git pull` on this branch, then read this file.
- If continuing the 2-take feature: test the actual on-device flow this
  session did not get to verify - record 2+ takes on a fresh question,
  confirm the pool>2 picker in Review & Trim behaves, confirm My Videos'
  expand panel switches primary correctly, confirm upload only sends the
  primary and cleans up the runner-up file afterward. Also worth settling
  the "plain retake keeps both by default" question above with Soham
  directly rather than assuming either way.
- If picking up language selection: the design is agreed (see above) -
  fix the VO cache key gap first, then build the picker, then wire
  re-fetch-on-switch.
