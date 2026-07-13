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
| 10 | Cross into JS with an empty face array instead of constructed `HybridFace` objects — isolates crossing-call cost from payload construction/marshaling cost | `DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD` (Kotlin) | **Did not help.** JS-side rate stayed ~1.5-2.6fps, same as with the real payload. Rules out `HybridFace` construction/marshaling as the cost. |
| 10b | Direct timing around the `options.onFacesDetected()` crossing call itself | timer around existing `DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD` branch (Kotlin) | **Crossing call is fast: 0.1-0.4ms every time.** Rules out JS thread contention/blocking on the crossing call too — neither half of the crossing (payload construction, nor the call itself) is the bottleneck. Raises a new question: why is the JS-facing rate still ~2.2fps when this and ML Kit's isolated process() speed (test #7) should allow ~7-8fps? See write-up below. |

### What test #9's failure actually tells us

If throttling the crossing frequency to 1-in-4 makes no difference to measured fps, the bottleneck isn't *how often* JS gets called — it's *how long each individual crossing costs*, and that cost appears to be roughly constant (~400-450ms) regardless of throttling. Looking at `handleFacesDetected` in `CameraAlignment.tsx`, the actual JS code that runs per call is cheap (basic arithmetic, `setSignals` gated to every 3rd call, logging gated to every 15th) — nowhere near 400ms of real work. That points at the **crossing/marshaling cost itself** (constructing the `HybridFace` Nitro object(s) and handing them to JS), not the JS code that runs afterward.

## Test #10 result: `HybridFace` payload construction is NOT the cost

Rebuilt and ran on-device with `DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD = true` (native code sends `emptyArray()` to JS instead of constructed `HybridFace` objects, but still makes the real `onFacesDetected()` call).

**Result: no change.** JS-side `detection callback rate` stayed at ~1.5–2.6fps, same range as every prior test with the real payload. This rules out `HybridFace` object construction/marshaling as the cost. (One `1000.00fps` line appeared at the very start of the log — that's a math artifact of the fps calculator's first sample, `spanMs` floor-clamped to 1ms — not a real data point, ignore it.)

Side effect observed (expected, not a bug): with this flag on, `faces` is always `[]`, so `computeAlignmentSignals` never runs, `signals` stays `null`, and the alignment guide overlay never shows a "correct" state / `goodFrameStreak` never advances. This diagnostic build is fps-measurement-only, not usable to visually verify alignment correctness.

Per the decision tree this test was set up to resolve: fps staying flat with an empty payload means the cost is **fixed per-crossing overhead, not proportional to payload size** — i.e. JS thread scheduling/contention, not data marshaling. Moving signal computation into Kotlin (the "send only primitives" fix direction) would NOT help, since the problem isn't what's being sent.

## Test #10b result: crossing call itself is NOT the cost either

Rebuilt and ran on-device with the crossing-duration timer active. **Result: `onFacesDetected() crossing blocked native thread for 0.1–0.4ms`** — sub-millisecond, every single time. The JSI crossing call itself returns almost instantly.

This rules out "JS thread contention/scheduling blocks the native call" — the call isn't blocking at all. Combined with test #10's result (payload construction isn't the cost either), **both halves of the crossing call are now confirmed fast.** The bottleneck is not the crossing call in any form.

The companion measurement (`analyze() invocation rate (live, real pipeline)`, windowed-fps calc) produced a bogus constant `1000.00fps` reading — a bug in that diagnostic's own math (window held only one fresh sample relative to the 1-second log-throttle interval, `spanMs` floor-clamped to 1ms, `size/spanMs` blew up), not a real measurement. Discarded; replaced in test #10c below.

**New question this raises**: if the crossing call is sub-ms and ML Kit's `process()` was measured at ~30fps in isolation (test #7, `DIAGNOSTIC_SKIP_JSI_BRIDGE`), then with the 1-in-4 crossing throttle (`CROSS_TO_JS_EVERY_N_FRAMES`) still active, JS-facing rate should land around ~7-8fps. It's still ~2.2fps. Something is holding back `analyze()`/`process()` itself from running at that rate in the **live, full pipeline** — possibly test #7's ~30fps measurement doesn't hold once everything real is running together (video output attached, real crossing path active, real throttle logic, etc.).

## Currently running test (as of last edit, not yet verified on-device)

**Test #10c**: replaced the buggy windowed-fps native counter with direct, ungated measurements:

1. `analyze() invoked, gap since previous: Xms` — raw ms gap between consecutive `analyze()` calls that pass the `isBusy` check. Logged on every single call, no windowing/throttling to hide behavior.
2. `ML Kit process() took Xms, faces=N` — wraps `faceDetector.process(inputImage)` directly, timed from call to `addOnSuccessListener` firing. Measures ML Kit's real inference cost in this exact live pipeline (not the isolated `DIAGNOSTIC_SKIP_JSI_BRIDGE` config test #7 used).

**What to look for:**
- If `process()` duration is consistently large (hundreds of ms) → ML Kit's own inference is NOT fast in the live pipeline, contradicting test #7's isolated ~30fps measurement. Likely cause: something about the live config (video-recording output sharing the session, real image sizes/rotation, thermal throttling under sustained load) makes inference genuinely slower than the isolated test suggested. Would need to re-verify test #1 (video-output-attached hypothesis) under this same measurement, and consider CPU/thermal state.
- If `process()` duration stays small (a few ms, matching test #7) but the gap between `analyze()` calls is large → something between `addOnCompleteListener` firing (which releases `isBusy`) and the next frame actually reaching `analyze()` is slow — e.g. CameraX's own frame delivery/backpressure, not ML Kit. Would need to check whether `STRATEGY_KEEP_ONLY_LATEST` is behaving as expected here, or add timing right at `addOnCompleteListener` itself to pin down the exact gap location.

## Test #10c result: native side is fast — the bottleneck is upstream of all of this

Rebuilt and ran on-device. Both new measurements came back healthy:
- `analyze() invoked, gap since previous:` mostly **~30-40ms** (i.e. ~25-30fps native cadence) — matches the isolated ~30fps ceiling from tests #6/#7.
- `ML Kit process() took` mostly **~15-25ms**, with periodic spikes to 80-200ms.
- Crossing call itself: still 0.2-0.5ms (confirmed again, consistent with test #10b).

So native `analyze()`/`process()`/crossing are all individually fast. Yet the JS-side `detection callback rate` is still pinned at ~2.2fps. With `CROSS_TO_JS_EVERY_N_FRAMES = 4` and a healthy ~25-30fps native cadence, JS-facing crossings should land around ~6-7.5fps — they don't. Something is preventing the `CROSS_TO_JS_EVERY_N_FRAMES` throttle from ever mattering.

## Prime suspect found: `useFaceDetectorOutput`'s broken `useMemo` — likely root cause

Read `node_modules/react-native-vision-camera-face-detector/src/hooks/useFaceDetectorOutput.ts` (confirmed as the file Metro actually resolves via this package's `"react-native": "src/index"` field in `package.json` — not the compiled `lib/` output):

```ts
export function useFaceDetectorOutput( {
  onFacesDetected, onError, outputResolution = 'preview', ...options
}: FaceDetectorOutputOptions ): CameraOutput {
  ...
  return useMemo(
    () => createFaceDetectorOutput( { ...options, ... } ),
    [ options ]
  )
}
```

`options` comes from a **rest-spread destructure** (`...options`). In JS, rest-spread always produces a brand-new object reference on every function invocation, regardless of whether the underlying values changed. Since this hook function body re-runs on every render of whatever calls it (`CameraAlignment.tsx`), `options` has a new reference every render — meaning `useMemo`'s `[options]` dependency looks like protection against unnecessary recreation, but is actually **always different**, so `createFaceDetectorOutput(...)` runs on every single render, unconditionally.

`createFaceDetectorOutput` constructs a brand-new native `HybridFaceDetectorOutput` Kotlin instance, whose constructor immediately calls `FaceDetection.getClient(options.toMLFaceDetectorOptions())` (`HybridFaceDetectorOutput.kt:49-51` — a property initializer, not lazy). That new `faceDetectorOutput` reference then flows into `CameraAlignment.tsx`'s `outputs` `useMemo` (depends on `faceDetectorOutput`), producing a new `outputs` array, which VisionCamera's `<Camera>` sees as a changed prop and reconfigures the live camera session around.

**The feedback loop this creates**: ML Kit detects a face → crosses to JS (throttled) → `handleFacesDetected` calls `setSignals` (every 3rd crossing) → React re-renders `CameraAlignment` → `useFaceDetectorOutput` re-runs → native face-detector output torn down (`dispose()` — closes the ML Kit client, closes the executor) and rebuilt from scratch (new ML Kit client construction, new `isBusy`, new executor thread, **`crossToJsFrameCounter` reset to 0**) → camera session reconfigured around the new output → new detector eventually produces a detection → crosses again → re-render again → ...

This single bug would explain **every prior test result** in this investigation:
- Why test #9 (throttle every-4th-frame) had zero effect: `crossToJsFrameCounter` never survives long enough between recreations for the throttle to matter.
- Why tests #10 and #10b (payload skip, crossing-duration timing) both measured fast, healthy numbers for the crossing call itself: the crossing call was never the bottleneck — what's expensive is the **session reconfiguration + fresh ML Kit client construction** happening around it, invisible to those two measurements.
- Why tests #6 and #7 (isolated, `DIAGNOSTIC_SKIP_MLKIT` / `DIAGNOSTIC_SKIP_JSI_BRIDGE`) measured a clean ~30fps: both skip calling `onFacesDetected` entirely, so `setSignals` never fires, so `CameraAlignment` never re-renders from that pathway, so `useFaceDetectorOutput` never re-runs mid-test, so the native output never gets torn down — no feedback loop in either isolated test.
- Why test #3 (hide overlay) had no effect: the recreation is driven by `setSignals` state changing, not by what's rendered.
- Why test #2 (remove fps cap) gave only partial improvement: faster frame delivery between recreation storms helps a little, but the periodic teardown/rebuild remains the dominant cost.

## Currently running test (test #11, as of last edit, not yet verified on-device)

Added lifecycle logging directly to `HybridFaceDetectorOutput.kt`: `Log.d("core-vc-diagnostic", "HybridFaceDetectorOutput CONSTRUCTED ...")` in an `init {}` block, and a matching `DISPOSED` log in `dispose()`, each with `System.identityHashCode(this)` so distinct instances are visible in the log.

**What to look for**: if the hypothesis is correct, expect a rapid stream of `CONSTRUCTED`/`DISPOSED` pairs with different instance IDs, roughly in sync with the ~2.2/sec crossing rate (or faster, since `setSignals` isn't the only thing that can re-render `CameraAlignment`). If instead there's just ONE `CONSTRUCTED` line for the whole alignment session and no `DISPOSED` until leaving the screen, the hypothesis is wrong and this isn't the cause.

**If confirmed, the fix** (not yet applied — confirm first): in `useFaceDetectorOutput.ts`, replace the `useMemo` dependency `[options]` with something that reflects actual value equality instead of the always-fresh rest-spread reference — simplest is `[JSON.stringify(options)]` (options only contains primitives: `performanceMode`, `minFaceSize`, `runLandmarks`, `runContours`, `runClassifications`, `trackingEnabled`, `autoMode`, `cameraFacing`, `windowWidth`, `windowHeight` — safe to stringify, no circular refs/functions). This is a `node_modules` fix, so it'll need the same `patch-package` treatment already planned in this doc for the Kotlin changes.

**Status: CONFIRMED.** Rebuilt and ran on-device. `HybridFaceDetectorOutput CONSTRUCTED (instance <id>)` appeared repeatedly with a different instance ID each time, each one ~5ms after a crossing (`onFacesDetected() crossing blocked...`) log line — i.e. every JS-side render triggered by a detection was tearing down and rebuilding the entire native ML Kit detector. The periodic ~110ms `ML Kit process()` spikes line up exactly with the reconstructions (camera session disruption from the output swap). This is the root cause.

**Additional finding, not yet resolved**: zero `DISPOSED` lines appeared anywhere in the captured window despite 5 `CONSTRUCTED` events — the old instances (each with their own ML Kit client + dedicated single-thread executor) don't appear to be getting cleaned up when swapped. Possible leak on top of the performance bug; may become moot once recreation stops, but worth re-checking after the fix lands.

## Fix applied (test #12, not yet verified on-device)

`node_modules/react-native-vision-camera-face-detector/src/hooks/useFaceDetectorOutput.ts` — replaced the broken `useMemo` dependency:

```ts
// before: [ options ]  - options is a fresh rest-spread object every render, so this never memoized anything
const optionsKey = JSON.stringify( options )
return useMemo( () => createFaceDetectorOutput( { ... } ), [ optionsKey ] )
```

`options` here only ever contains primitives (`performanceMode`, `minFaceSize`, `runLandmarks`, `runContours`, `runClassifications`, `trackingEnabled`, `autoMode`, `cameraFacing`, `windowWidth`, `windowHeight`), so `JSON.stringify` safely reflects real value equality instead of the always-different object reference. This should make `createFaceDetectorOutput` (and the native ML Kit client + CameraX use case it builds) only re-run when the actual config values change — not on every render.

This is a pure JS/TS change (no Kotlin touched) — should pick up via Fast Refresh / a JS reload, **no full native rebuild needed** this time.

## Test #12 result: FIX CONFIRMED — lag is gone

Reloaded JS, ran on-device. **Visible camera preview lag is gone.** Logcat over a ~3.3s window confirms: zero `CONSTRUCTED`/`DISPOSED` lines at all (no more recreation), steady `analyze()` gap ~30-40ms, steady `ML Kit process()` ~20-30ms with no more periodic 100-200ms spikes (one isolated 193ms blip, not a recurring pattern), crossing calls still sub-ms as before.

**This answers the session's original question**: React Native + ML Kit via this wrapper library CAN hit acceptable, smooth performance during alignment. The lag was never an inherent RN/ML Kit ceiling — it was `useFaceDetectorOutput`'s broken memoization causing constant native session teardown/rebuild. The v1 architecture (on-device CV framing coaching in `CLAUDE.md`) is not blocked by this.

**Not yet verified**: `DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD` was still `true` during this test, so JS was still only receiving `emptyArray()` from every crossing — fps/smoothness is confirmed, but the alignment guide overlay locking with *real* face data end-to-end is not yet confirmed. Flipped back to `false` — next test.

## Currently running test (as of last edit, not yet verified on-device)

**Test #13**: `DIAGNOSTIC_SKIP_HYBRID_FACE_PAYLOAD` set back to `false` in `HybridFaceDetectorOutput.kt` — real `HybridFace` objects now cross to JS again. Needs a full native rebuild (Kotlin changed).

**What to verify**:
1. Preview still smooth/lag-free with the real payload flowing (expect yes, per test #10's earlier finding that payload construction was never the cost).
2. The alignment guide overlay actually reaches `goodFrameStreak` >= `requiredFrames` and fires `[alignment] LOCKED — ready to record` in the JS console — i.e. the whole pipeline works end-to-end, not just the fps number.

**Status: edit made, not yet rebuilt/tested on-device. This is the very next thing to do.**

## Root-cause confirmed as package-level, not app-level

The bug lives entirely in `react-native-vision-camera-face-detector`'s own `useFaceDetectorOutput.ts` hook (a bundled third-party npm package) - none of this app's own code (`CameraAlignment.tsx`, `alignment.ts`, `useAlignmentLock.ts`) was at fault. The hook is plain cross-platform TypeScript (confirmed: the library ships separate native implementations for Android (`android/.../HybridFaceDetectorOutput.kt`) and iOS (`ios/HybridFaceDetectorOutput.swift`), but both are driven through this single shared JS/TS entry point) - so the fix, once applied there, covers both platforms without touching either native side.

## Decision: drop the Kotlin patch, keep only the TS fix

All Kotlin changes made during this investigation (resolution downscale to 640x480, `CROSS_TO_JS_EVERY_N_FRAMES` throttle, all `DIAGNOSTIC_*` flags, all timing/lifecycle logging) were either diagnostic scaffolding for hunting the bug, or speculative performance tweaks made *before* the real cause was known, under the wrong assumption that crossing into JS or native processing was itself expensive. Both were directly measured as fast (crossing: sub-ms: process(): ~20-30ms steady) once the actual bug was found - neither Kotlin change is load-bearing for the fix.

Reverted `node_modules/react-native-vision-camera-face-detector` to a pristine reinstall (`rm -rf` the package folder + `npm install react-native-vision-camera-face-detector@2.0.2 --no-save`, matching the version pinned in `package-lock.json`), then reapplied *only* the `useFaceDetectorOutput.ts` `useMemo` dependency fix. `HybridFaceDetectorOutput.kt` is now 100% stock - zero patch needed on the native side, for either platform.

If per-frame JS update throttling is still wanted later (battery, not smoothness - smoothness is solved), it should be done in this app's own `handleFacesDetected` (`CameraAlignment.tsx`) as a plain JS "skip every Nth call" check, not inside the library's native code - keeps it cross-platform by construction with zero native maintenance.

**Next: rebuild and confirm the app still works correctly (smooth + actually locks) running on 100% stock native code + the one TS patch. If confirmed, generate and commit the `patch-package` patch (only one small file - `useFaceDetectorOutput.ts` - no native files).**

## Test #13 result: CONFIRMED — smooth, locks correctly, no throttle needed

Rebuilt and ran on-device on 100% stock Kotlin + the one-line TS patch. No lag. `detection callback rate` measured ~29-29.7fps (every native detection now crosses to JS - stock code has no `CROSS_TO_JS_EVERY_N_FRAMES` throttle) and `[alignment] LOCKED — ready to record` fired correctly with real face data. Smoother than the throttled mid-investigation version, since there's no longer any reason to throttle.

## Cleanup completed

- `CameraAlignment.tsx`: removed all `DIAGNOSTIC_*` flags, the fps-diagnostic measurement/logging block, and the on-screen diagnostic panel added during this investigation (diffed against the pre-investigation commit to confirm exactly what to remove). Also removed `ALIGNING_FPS_CONSTRAINT` (the pre-existing 8fps cap during alignment) - now that the real bug is fixed and native runs smoothly uncapped at ~30fps, the cap no longer serves a purpose; keeping it would just make the guidance UI less responsive for no benefit.
- `node_modules/react-native-vision-camera-face-detector`: reverted to a pristine reinstall (`react-native-vision-camera-face-detector@2.0.2`, matching `package-lock.json`), with only the one-line `useFaceDetectorOutput.ts` fix reapplied. `HybridFaceDetectorOutput.kt` (Android) is fully stock; iOS's equivalent Swift file was never touched at all.
- Generated `patches/react-native-vision-camera-face-detector+2.0.2.patch` via `npx patch-package react-native-vision-camera-face-detector` (had to clean stale `android/build`/`android/.cxx` folders left over from earlier native rebuilds first - same build-artifact-pollution gotcha as the first patch-generation attempt, noted earlier in this doc). The resulting patch touches exactly one file, ~15 real lines changed.

**Status: investigation complete. Root cause found and fixed, fix confirmed working end-to-end, code cleaned up, patch generated. Not yet committed/pushed - pending user go-ahead.**

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

1. Rebuild (normal build first, see gotchas above) and test the test #10c timing instrumentation. Watch `adb logcat -s core-vc-diagnostic:D` (JS console logs not needed for this one) and report the pattern of `analyze() invoked, gap since previous: Xms` and `ML Kit process() took Xms, faces=N` lines — specifically whether `process()` duration is large (hundreds of ms) or small (a few ms, matching test #7's isolated result).
2. Based on result (see "What to look for" under test #10c above), either:
   - (`process()` itself is slow live) → re-verify test #1 (video-output-attached hypothesis) under direct timing rather than fps inference; consider CPU/thermal throttling under sustained real-pipeline load.
   - (`process()` is fast but gap between calls is large) → add timing right at `addOnCompleteListener` to find the gap between `isBusy` releasing and the next `analyze()` call actually arriving — points at CameraX frame delivery/backpressure, not ML Kit.
3. Once a real fix is confirmed working, strip out all the diagnostic-only flags/logging from `HybridFaceDetectorOutput.kt` and `CameraAlignment.tsx` (they were explicitly marked "not meant to ship").
4. Regenerate a clean `patch-package` patch for the final fix.
5. Commit and push the `experiment/face-detection-diagnostics` branch (not `main`) to remote.
