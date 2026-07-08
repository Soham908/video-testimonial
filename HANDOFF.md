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

## New laptop setup session (2026-07-08)

Got the dev environment fully working on this (second new) laptop. **Project now lives at `C:\dev\video-testimonial`**, not under `Desktop\Soham\website work\...` — same path-length problem as the very first machine (see `SETUP_LOG.md`), hit again here despite this being a different laptop. Four independent, unrelated problems stacked on top of each other; each only became visible once the previous one was fixed:

1. **Native build failing** — `ninja: error: manifest 'build.ninja' still dirty after 100 tries` on `react-native-fast-tflite`/`react-native-nitro-image`'s CMake build. Root cause: Windows' 260-char `MAX_PATH` limit, same as the original machine.
   - Enabling Windows' `LongPathsEnabled` registry setting did **not** fix it — `ninja.exe` has the 260-char limit hardcoded in its own code and doesn't consult that setting.
   - A directory junction (short-path alias) did **not** fix it either — Gradle/Java resolved the alias back to the real long path before generating build paths.
   - A `subst` virtual drive got further (avoided the resolve-back problem) but broke a different Gradle step — a `providers.exec` call to Node (`expoAutolinking.useExpoModules()` in `settings.gradle`) failed on the substituted drive.
   - **Actual fix**: moved the project to a genuinely short real path, `C:\dev\video-testimonial` (copied source only — `node_modules`/`android`/`.expo` are gitignored/regenerable, so they were excluded from the copy and rebuilt fresh via `npm install` + prebuild, avoiding the old machine's stale-build-cache-with-hardcoded-paths bug).
2. **App crashing on launch** — `ClassNotFoundException: expo.modules.splashscreen.SplashScreenManager`. `expo-splash-screen` was never actually added to `package.json`'s dependencies (only implicitly expected), so its native Android module never got linked. Fixed by `npx expo install expo-splash-screen`.
3. **Blank white screen, app never loading JS bundle** — the laptop's Wi-Fi network was classified by Windows as **Public**, so Windows Firewall silently dropped the phone's inbound connection attempts to Metro (port 8081), even on the same Wi-Fi/subnet. Fixed via `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private`.
4. **Still failing after that** — `java.lang.Exception: Failed to open app` / `UnexpectedServerData: Unexpected server error: No returned query result`. Once the firewall was out of the way the phone could reach Metro (confirmed via a live `ESTABLISHED` TCP connection in `netstat`), but manifest serving still failed because the Expo CLI does a background account check (`currentUserAsync` GraphQL query to `api.expo.dev`) on every start, and a stale/invalid cached login session (`~/.expo/state.json`, dated April 2025) was being rejected server-side in a way the CLI didn't handle gracefully. Fixed by `npx expo logout`.

Also installed/configured on this laptop as part of getting here: Android Studio, JDK (via Android Studio's bundled JBR), Android SDK platforms 35 & 36, build-tools 35.0.0 & 36.0.0, NDK 27.1.12297006, CMake 3.22.1, `platform-tools` (adb) — `JAVA_HOME`/`ANDROID_HOME` set as permanent user env vars.

**End state: confirmed working** — `npx expo run:android --device` builds and installs cleanly, the dev-client connects to Metro over Wi-Fi, and the JS bundle loads on a real device.

## Where things stand right now
- Dev environment on this laptop is fully working end-to-end (see above). Project root is now `C:\dev\video-testimonial`.
- The durable-storage/cleanup/button-polish changes (commit `f21d261`) have **not yet been re-verified** on-device since the app is only just loading again — this is the immediate next thing to click through.
- Everything is committed and pushed to `origin/main` — nothing local/uncommitted was lost. The old copy at `Desktop\Soham\website work\video-testimonial` still exists untouched (not deleted); safe to remove once you've confirmed you're working from `C:\dev\video-testimonial` going forward.

## Next steps (in priority order)
1. Re-verify the durable-storage/cleanup/button changes on a real device (never confirmed after the last rebuild, and the app only just started loading again on this laptop).
2. Decide + implement the TTS approach (pre-generated static audio files recommended, see above) — this unblocks replacing the "Continue" placeholder button with real auto-advancing playback.
3. Still open/deferred: MediaPipe/BlazeFace performance rewrite (only if lag becomes a blocker), real background/resumable upload to Cloudflare R2, server-side transcription + Claude sentiment analysis + nexrender rendering (all out of mobile-app scope for now).
4. For deep step-by-step history/reasoning beyond this summary, `FRAME_PROCESSOR_PROGRESS.md` in the repo has a detailed running log of every step taken.
