# Handoff Summary — Video Testimonial App

Repo: https://github.com/Soham908/video-testimonial (branch `main`, all work pushed, working tree clean as of commit `f21d261`).

## What this app is
React Native (Expo bare/dev-client) app that guides distributors through recording their own video testimonials, using on-device computer vision to coach framing/lighting in real time instead of a professional shoot. Full context/architecture decisions live in `CLAUDE.md` at repo root — read that first on the new machine.

## What's been built so far

1. **Scaffolded Expo bare/dev-client app** with `react-native-vision-camera` live preview (not Expo Go — needs native rebuilds for camera/ML modules).
2. **Real-time face-alignment coaching** using `react-native-vision-camera-face-detector` (an ML Kit wrapper):
   - Signals computed: centering, distance, headroom (all from face landmarks).
   - Alignment-lock state machine: ~15-20 consecutive good frames required before question 1, lighter ~5-8 frame recheck before questions 2-5.
   - Guide overlay fades out once locked; detection is fully paused during actual recording (to protect performance) and only lightly rechecked between questions.
3. **Full app flow wired end-to-end**: welcome → consent → home → per-question (align → TTS-intro placeholder → 5s countdown → record → keep/redo prompt) → upload placeholder → completion.
4. **Real video recording**: using VisionCamera's own built-in `Recorder` API (no extra dependency needed) — records to temp cache, one Recorder per take.
5. **Real video playback**: added `expo-video` — tapping a recorded video on the Home screen plays it back with native controls.
6. **Durable storage + cleanup**: added `expo-file-system` (new API) — finished recordings get moved from temp cache to durable app document storage (`recordings.ts`); starting a new session clears prior recordings (a **testing convenience only** — flagged in code as something a real product would not do, since it would keep multiple completed sessions).
7. **UI polish pass**: cleaned up placeholder/dev-labeled buttons ("Continue", "Finish Answer" as a real styled button, "Skip for now" as a text link), fixed a click-blocking z-order bug on the redo-prompt overlay, fixed a ConsentScreen scroll/layout bug.

## Key decisions & tradeoffs agreed on

- **ML Kit vs. MediaPipe/BlazeFace**: Real, noticeable on-device lag was found and diagnosed as genuine ML Kit native inference cost (confirmed by testing a Release APK, not just debug overhead — ruled that out explicitly). Partial mitigations applied: lowered detection fps (12→8), raised `minFaceSize` to 0.25 (shrinks ML Kit's search space), throttled UI state updates, fully disabled detection during recording. Lag is better but not fully gone. **Decision: defer the MediaPipe/BlazeFace rewrite** — it would require manually bundling a `.tflite` model, manually preprocessing frames into tensors, manually decoding anchor boxes + non-max suppression, and moving to the lower-level frame-processor+worklets API — sized as several times the effort of the ML Kit path, with real unknowns. Not rejected outright, just not worth it right now vs. other work.
- **Video recording flow**: segment-wise (one file per question), not continuous single-take — makes retakes trivial, avoids timestamp-splitting logic later (this was a pre-existing CLAUDE.md decision, reaffirmed during recording implementation).
- **TTS approach (open, leaning toward a recommendation)**: discussed whether ElevenLabs API key is strictly necessary. Recommendation given: **pre-generate static TTS audio files once (offline), bundle as assets, play via the already-installed `expo-video`** — no runtime API key needed, works offline, matches the "no simultaneous playback+record" design. This was well-received but **not yet finalized/implemented** — still an open decision on the new laptop.
- **Storage**: VisionCamera records to app sandbox storage directly — no gallery/MediaLibrary permission ever needed, matches CLAUDE.md's storage decision.

## Known bugs / gotchas fixed this session
- Missing `babel-preset-expo` dependency (Metro transform errors) — fixed by adding to devDependencies.
- Camera+mic permission race condition (Android only shows one permission dialog at a time) — fixed by sequencing requests.
- `StyleSheet.absoluteFillObject` doesn't exist in RN 0.86 — use `StyleSheet.absoluteFill` instead (hit twice).
- Redo-prompt buttons were unclickable — a z-order bug (RecordingScreen's own chrome painted after children); fixed by rendering the overlay as a sibling, not a child.
- ConsentScreen had a real scroll-container layout bug (missing `flex: 1` on the ScrollView style).

## Where things stand right now
- Last real device test: the durable-storage + cleanup + button-polish changes (commit `f21d261`) were built successfully (`BUILD SUCCESSFUL`), but the **install step failed because the phone had disconnected from USB mid-build**. This was never re-verified on-device — that's the first thing to redo on the new machine (or reconnect the original phone).
- Everything is committed and pushed to `origin/main` — nothing local/uncommitted was lost.

## Next steps (in priority order)
1. Get the dev environment running on the new laptop: clone the repo, `npm install`, set `JAVA_HOME`/`ANDROID_HOME`, connect an Android phone (not emulator — camera work needs real hardware), `npx expo run:android`.
2. Re-verify the durable-storage/cleanup/button changes on a real device (never confirmed after the last rebuild).
3. Decide + implement the TTS approach (pre-generated static audio files recommended, see above) — this unblocks replacing the "Continue" placeholder button with real auto-advancing playback.
4. Still open/deferred: MediaPipe/BlazeFace performance rewrite (only if lag becomes a blocker), real background/resumable upload to Cloudflare R2, server-side transcription + Claude sentiment analysis + nexrender rendering (all out of mobile-app scope for now).
5. For deep step-by-step history/reasoning beyond this summary, `FRAME_PROCESSOR_PROGRESS.md` in the repo has a detailed running log of every step taken.
