# Face Detection Lag Investigation — Working Notes

Branch: `experiment/face-detection-diagnostics` (never merge into `main` until resolved).
Purpose of this file: let this investigation be picked up from a different machine with full context. Update it as new tests/results come in.

## The problem

During the alignment/setup phase (before recording starts), the camera preview visibly lags. Once alignment locks and face detection stops running continuously, the lag disappears. Google's own docs say ML Kit face detection (FAST mode, no landmarks/contours/classification) should hit 30+fps on mid-range Android hardware — we were measuring ~2.2–5fps.

## Stack involved

- Expo bare/dev-client workflow (SDK 57), RN 0.86, React 19.2, TypeScript.
- `react-native-vision-camera` v5.1.0 — modern **declarative `CameraOutput`** architecture (session-shared outputs like `videoOutput` and `faceDetectorOutput`, both attached to one `<Camera>`), not the older classic frame-processor/worklets architecture most community ML Kit wrappers use.
- `react-native-vision-camera-face-detector` v2.0.2 (by luicfrr) — Nitro Modules-based, wraps `com.google.mlkit:face-detection:16.1.7`.
- Relevant app files: `CameraAlignment.tsx` (JS-side detection handling + camera setup), `alignment.ts` (pure alignment-signal math, untouched), `useAlignmentLock.ts` (streak/lock logic, untouched).
- Native file being patched directly in `node_modules` (see "Persisting changes" below): `node_modules/react-native-vision-camera-face-detector/android/src/main/java/com/margelo/nitro/camera/facedetector/HybridFaceDetectorOutput.kt`.

## Key architectural facts established

1. **Single camera hardware ownership**: Android only allows one open camera session per physical camera. Anything running alongside live preview + recording must be an additional `CameraOutput` on the *same* session — this is why a bare/custom CameraX pipeline can't just be dropped in next to VisionCamera; it's why an RN wrapper library is needed at all instead of directly using CameraX from JS.
2. **`isBusy` drop-not-queue pattern** (confirmed correct via reading the library's Kotlin source): the analyzer uses `AtomicBoolean isBusy` + `ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST`, so busy frames are dropped, not queued. This part of the library is implemented correctly per Google's own best-practice.
3. **Critical gating fact**: `isBusy` only releases inside `addOnCompleteListener`, which fires *after* `addOnSuccessListener`'s block finishes running — including the JS-crossing `options.onFacesDetected()` call. So however long that JS-crossing call takes to return is however long the native detection loop is fully stalled before it can look at the next frame. This is the crux of the whole investigation.
4. Nitro Modules/JSI let native Kotlin talk to JS without JSON serialization (unlike the old RN bridge), but the `HybridFace` objects passed to JS are Nitro **HybridObjects** — richer, lazily-evaluated wrapper objects (with getters for `bounds`, `landmarks`, `contours`, etc.), not plain data — which may carry non-trivial per-call construction cost. This is the current leading hypothesis (see "Currently running test" below).

## Standalone native test app (ground truth, no RN at all)

Built `C:\dev\mlkit-native-test\` — a plain Kotlin/CameraX/ML Kit Android app with zero React Native, to establish the true capability ceiling of the hardware:
- CameraX `ImageAnalysis` + ML Kit face detection, same busy-flag drop-not-queue pattern, `PERFORMANCE_MODE_FAST`.
- **Result: rock solid ~30fps with no lag**, dropping to ~18fps only when landmarks are enabled — still smooth, never choppy.
- Added a face-alignment guide overlay (oval), face-count/bounds readout, distance check, backlighting check (YUV luma sampling, no ML model needed), headroom check (measured but not gated — see below).
- **Conclusion**: ML Kit itself, and CameraX's own pipeline, are NOT the bottleneck. The hardware is fully capable. The problem is specific to the RN wrapper's JS-crossing path.

## Diagnostic methodology

Single-variable elimination, using boolean flags that gate one hypothesis at a time — never changing more than one variable per rebuild/test. Flags live in `CameraAlignment.tsx` (JS-side) and `HybridFaceDetectorOutput.kt` (native-side, patched directly in `node_modules`).

## Tests run so far, in order, with results

| # | Test | Flag | Result |
|---|------|------|--------|
| 1 | Detach video-recording output entirely (detection-only session) | `DIAGNOSTIC_DISABLE_VIDEO_OUTPUT` | Ruled out — lag unchanged (~2-3fps) with or without the second consumer output. |
| 2 | Remove the 8fps camera-session constraint applied during alignment | `DIAGNOSTIC_DISABLE_FPS_CAP` | Partial cause — detection rate roughly doubled (~2-3 → ~4.5-5fps), feed felt "a bit smoother," but visible lag persisted. Currently left `true` (cap removed) as a baseline improvement. |
| 3 | Hide the on-screen overlay/diagnostic UI entirely during alignment (detection logic still runs underneath) | `DIAGNOSTIC_HIDE_OVERLAY` | Ruled out — lag identical, detection rate unchanged with zero UI rendered. |
| 4 | Detach the face-detector output from the session entirely (ML Kit not running at all) | `DIAGNOSTIC_DISABLE_FACE_DETECTION` | Confirms detection is *a* cause when active, but doesn't by itself explain why (see below). |
| 5 | Standalone native app, ML Kit + CameraX with no RN | n/a (separate project) | ~30fps rock solid (~18fps with landmarks on). Rules out ML Kit/CameraX hardware capability as the bottleneck. |
| 6 | Native-side: skip the ML Kit call entirely, just measure how often VisionCamera invokes `analyze()` | `DIAGNOSTIC_SKIP_MLKIT` (Kotlin) | Isolates VisionCamera's own frame-delivery rate from ML Kit. Confirmed VisionCamera core delivery itself is NOT the bottleneck (~28-30fps). |
| 7 | Native-side: run real ML Kit `process()`, but skip building `HybridFace` objects and skip calling `options.onFacesDetected()` (the JSI crossing) entirely | `DIAGNOSTIC_SKIP_JSI_BRIDGE` (Kotlin) | **~30fps.** Confirms ML Kit's own inference is fast — the bottleneck appears only once you actually cross into JS. |
| 8 | JS-side: skip `computeAlignmentSignals`/`registerFrame`/`setSignals` entirely, keep only fps-timestamp logging | `DIAGNOSTIC_SKIP_JS_PROCESSING` (CameraAlignment.tsx) | Flag exists, currently `false`. (Not conclusively tested in isolation before the investigation moved to the throttle fix — worth re-running cleanly if needed.) |
| 9 | **Throttling fix**: keep ML Kit running at full native speed, but only cross into JS every 4th successful detection instead of every one (`CROSS_TO_JS_EVERY_N_FRAMES = 4`) | `crossToJsFrameCounter` logic (Kotlin) | **Did not help.** JS-facing rate stayed at ~2.2-2.8fps, same as before the fix, whether crossing every 1 or every 4 frames. This disproves the theory that "crossing frequency" was the problem. |

### What test #9's failure actually tells us

If throttling the crossing frequency to 1-in-4 makes no difference to measured fps, the bottleneck isn't *how often* JS gets called — it's *how long each individual crossing costs*, and that cost appears to be roughly constant (~400-450ms) regardless of throttling. Looking at `handleFacesDetected` in `CameraAlignment.tsx`, the actual JS code that runs per call is cheap (basic arithmetic, `setSignals` gated to every 3rd call, logging gated to every 15th) — nowhere near 400ms of real work. That points at the **crossing/marshaling cost itself** (constructing the `HybridFace` Nitro object(s) and handing them to JS), not the JS code that runs afterward.

## Currently running test (as of last edit, not yet verified on-device)

Testing whether the `HybridFace` object construction/marshaling itself is the expensive part, separate from the act of invoking the JS callback at all.

In `HybridFaceDetectorOutput.kt`, on the crossing path (inside the `CROSS_TO_JS_EVERY_N_FRAMES` throttle), added:
```kotlin
private val DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD = true

// in analyze()'s addOnSuccessListener, after the crossToJsFrameCounter throttle check:
if (DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD) {
  options.onFacesDetected(emptyArray())
  return@addOnSuccessListener
}
val hybridFaces = faces.map { HybridFace(it, config) }.toTypedArray<HybridFaceSpec>()
options.onFacesDetected(hybridFaces)
```
This still invokes the real JS callback (`onFacesDetected`) — same crossing — but passes an empty array instead of real, constructed `HybridFace` objects.

**Expected outcomes and what they'd mean:**
- If fps recovers toward ~20-30fps → the `HybridFace` object construction/marshaling is the real cost. Fix direction: send plain primitive data (e.g. just `x/y/width/height` as four doubles) instead of a rich Nitro HybridObject, or move alignment-signal computation into Kotlin entirely and send back only a tiny plain result (`{centered, distanceOk, headroomOk}` or similar) — avoiding heavy per-frame object construction. (This was previously discussed as a "move computation into Kotlin" idea and deliberately deferred because it requires editing the `.nitro.ts` spec + rerunning Nitro codegen — a bigger task than editing existing generated Kotlin. If this test confirms it's the actual fix needed, that deferred work becomes necessary, not optional.)
- If fps stays at ~2.2fps even with an empty payload → the cost is a roughly fixed per-crossing overhead unrelated to payload size (e.g. JS thread scheduling/contention, not data size). Would need a different approach — possibly batching multiple frames' worth of native-side work before ever crossing, or investigating JS thread contention with other bridge traffic.

**Status: edit made, not yet rebuilt/tested on-device. This is the very next thing to do.**

## Known build/rebuild gotchas

- Use `npx expo run:android --device` for any native (Kotlin) change — a full rebuild+install+launch. `npx expo start` / `--dev-client` only rebuilds the JS bundle and will NOT pick up Kotlin changes.
- **This specific file (`HybridFaceDetectorOutput.kt`) has silently failed to recompile on a normal build twice already this session** — measured fps stayed identical to the pre-edit numbers, revealing the build hadn't actually picked up the new source. First time: fixed by deleting the module's local `.cxx`/`build` folders and rebuilding. Second time: recurred despite the same fix, traced to Gradle's own separate global build cache; fixed with `--rerun-tasks` (forces full re-execution bypassing all caching layers).
- `--rerun-tasks` is a blunt hammer — it forces recompilation of every module in the project including slow, unrelated ones (`react-native-fast-tflite`'s C++ TensorFlow Lite build specifically), which took 16+ minutes and appeared to hang around 93-94% (it wasn't hung, just genuinely slow — check Task Manager for real CPU activity if this happens again).
- Recommended approach when testing this Kotlin file going forward: **try a normal build first.** Only if the fps numbers come back identical to the previous test (suggesting a stale build again) escalate to deleting just this module's `build`/`.cxx` folders (targeted, fast) before reaching for the much slower `--rerun-tasks`.
- `gradlew clean` can itself fail (`externalNativeBuildCleanDebug` / CMake "Configuring incomplete" error) if a module's `.cxx` folder was already manually deleted beforehand — skip `gradlew clean` entirely in that case, just delete the folders directly and rebuild fresh.

## Persisting the native fix (unresolved, paused)

`node_modules/` is gitignored, so none of this session's direct edits to `HybridFaceDetectorOutput.kt` are tracked by git or will survive a fresh `npm install` on another machine as-is.

Plan in progress: `patch-package`.
- Installed as a devDependency, `"postinstall": "patch-package"` added to `package.json` scripts (both already committed/present — check `package.json` on the other machine).
- First patch-generation attempt was polluted with ~1000+ lines of build-artifact noise (compiled `.class`/`.jar`/`.cxx`/`build/` output wasn't cleaned before diffing). That bad patch was deleted and the build artifacts (`android/build`, `android/.cxx` inside the package folder) were cleaned.
- **Regeneration was not completed** — paused to focus back on actually finding the fix first, since patching a fix that isn't confirmed working yet would be premature. Once the `DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD` test above lands on a real fix, clean up the diagnostic-only flags/logging left in the file, then regenerate via `npx patch-package react-native-vision-camera-face-detector` (after confirming `android/build` and `android/.cxx` are clean inside the package folder first), and commit `package.json`, `package-lock.json`, and the new file under `patches/`.
- **Not yet pushed to remote** — was waiting on the above to be sorted first.

## Next steps (in order)

1. Rebuild (normal build first, see gotchas above) and test the `DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD = true` change. Report the fps numbers.
2. Based on result, either:
   - (payload construction confirmed as the cost) → design the real fix: minimal plain-data payload across the bridge, likely requiring either a slimmer Nitro spec or moving signal computation into Kotlin.
   - (no change) → investigate JS-thread-side contention/scheduling as the fixed per-crossing cost instead.
3. Once a real fix is confirmed working, strip out all the diagnostic-only flags/logging from `HybridFaceDetectorOutput.kt` and `CameraAlignment.tsx` (they were explicitly marked "not meant to ship").
4. Regenerate a clean `patch-package` patch for the final fix.
5. Commit and push the `experiment/face-detection-diagnostics` branch (not `main`) to remote.
