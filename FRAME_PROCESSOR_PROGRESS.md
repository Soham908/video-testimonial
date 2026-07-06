# Frame processor / face-alignment progress log

Branch: `feature/face-alignment-frame-processor`

Goal: wire up the first on-device CV check — face-detection-based
alignment lock (centering + distance + headroom) per CLAUDE.md's v1
architecture. This file is a running log of steps completed, so progress
survives even if a session gets cut short.

## Plan (checklist)
- [x] 1. Research VisionCamera v5 frame processor + worklets API
- [x] 2. Wire face detector onto `<Camera>`, stream raw face detections to JS console
- [x] 3. Compute centering/distance/headroom signals from face bounds
- [x] 4. Build alignment-lock state machine (consecutive good-frame counter)
- [x] 5. Build guide overlay UI with fade-out on lock/record start
- [ ] 6. Verify on real device, commit

## Log

### Step 1 — Research (done)
Good news: no manual frame-processor/worklet code needed for face detection.
`react-native-vision-camera-face-detector` exports its own `<Camera>` component
(`views/Camera.js`) that internally wraps the base VisionCamera `<Camera>` and
adds a native `CameraOutput` (via `createFaceDetectorOutput`, a Nitro
HybridObject) that streams `Face[]` straight to a plain JS callback
(`onFacesDetected`) — not a worklet, so normal `setState` works directly
inside it, no `runOnJS`/worklets plumbing required for v1.

Data shape per detected `Face`:
- `bounds: { x, y, width, height }` — face bounding box in frame coordinates
- `landmarks?: { LEFT_EYE, RIGHT_EYE, NOSE_BASE, MOUTH_LEFT/RIGHT/BOTTOM, LEFT/RIGHT_CHEEK, LEFT/RIGHT_EAR }` (each a `Point`) — only populated if `runLandmarks: true`
- `contours?`, `pitchAngle/rollAngle/yawAngle`, `leftEyeOpenProbability`, `rightEyeOpenProbability`, `smilingProbability`, `trackingId`

`device` prop accepts a `CameraDevice` object OR a position string (`'front'`)
directly — our existing `useCameraDevice('front')` hook still works fine,
just pass its result straight through to the wrapped `<Camera>`.

Plan: swap our `<Camera>` import (from `react-native-vision-camera`) for the
one from `react-native-vision-camera-face-detector`, keep all existing props
(`device`, `isActive`, `style`), add `runLandmarks`, `onFacesDetected`,
`onError`. Compute centering/distance/headroom inside `onFacesDetected`
directly — combining steps 2 and 3 into one implementation pass since the
API is simpler than expected.

### Steps 2+3 — Wiring + signals (done)
- Added `alignment.ts`: pure functions `computeAlignmentSignals(bounds,
  frameWidth, frameHeight)` → `{ centered, distanceOk, headroomOk }`, and
  `isFullyAligned(signals)`. Thresholds are ratios (center tolerance 15%,
  face-width ratio 0.35-0.75, headroom ratio 0.05-0.35) — starting points,
  expect to tune against real footage on-device.
- `App.tsx`: swapped `Camera` import to
  `react-native-vision-camera-face-detector`, kept `device`/`isActive`/`style`
  as before. Added `runLandmarks`, `autoMode` + `windowWidth`/`windowHeight`
  (from `useWindowDimensions()`) so bounds come back pre-scaled to screen
  coordinates instead of raw sensor-space. `onFacesDetected` logs to console
  every 15th frame (~2x/sec) with the computed signals, to confirm data
  flows correctly before building the lock state machine on top.
- Found + fixed a type-only bug in the face-detector package's `.d.ts`: its
  `ComponentType` interface declares a required `output: CameraOutput[] |
  undefined` field that the actual runtime component never reads (it builds
  its own `outputs` array internally, plural). Fixed by passing
  `output={undefined}` — satisfies the type, does nothing at runtime.
- `npx tsc --noEmit` passes clean.

### Step 4 — Alignment-lock state machine (done)
Added `useAlignmentLock.ts`: a hook taking `mode: 'initial' | 'recheck'`
(18 vs 6 required consecutive good frames, per CLAUDE.md's ~15-20 / ~5-8
spec), exposing `{ isLocked, goodFrameStreak, requiredFrames, registerFrame,
reset }`. `registerFrame(aligned)` increments/resets the streak and flips
`isLocked` once the threshold is hit; once locked it ignores further frames
until `reset()` is called (not wired to anything yet — that's for when the
5-question flow and re-lock-between-questions logic gets built).

`App.tsx` now calls `registerFrame` on every detection callback and logs
once when the lock transitions to `true` ("LOCKED — ready to record"). Only
`'initial'` mode is used for now since there's still just one screen — the
`'recheck'` mode has no caller yet, which is expected at this stage.

`npx tsc --noEmit` passes clean.

### Step 6 — On-device verification: found and fixed lag (in progress)
Working end to end on a real phone: lock detection, oval guide, fade-out
all confirmed correct — but with noticeable lag, which wasn't present
before face detection was added (the plain camera preview alone had none).

Two causes identified:
1. `runLandmarks: true` was on but nothing reads landmark data yet (only
   `bounds` is used) — landmark detection is a meaningfully heavier ML Kit
   model than plain bounding-box detection. Removed; added
   `performanceMode="fast"` explicitly.
2. Every detection callback (20-30+/sec) was pushing straight to React
   state in two places (`setSignals` in App.tsx, and internally inside
   `useAlignmentLock`'s `registerFrame`), re-rendering the whole overlay
   at that rate. Throttled both to update UI-facing state ~10x/sec instead
   (every 3rd callback), while the streak/lock logic itself still runs on
   every raw callback via refs, so lock-timing accuracy is unaffected —
   only how often the *display* refreshes changed. Lock transitions still
   update immediately (not throttled) so the fade-out isn't delayed.

Not yet re-verified on device after this fix — that's the next thing to do.

`npx tsc --noEmit` passes clean.

### Step 6 continued — actually reducing detection frequency (done)
The render-throttling fix above only reduced JS-side reaction cost; ML Kit
was still running inference on every camera frame (20-30+/sec), which is
the real dominant cost of continuous on-device CV — this is the exact
budget/mid-range-hardware risk CLAUDE.md flagged going in.

Rather than a full custom frame-processor + worklets + shared-value rewrite
(meaningfully more complexity), used two levers already in VisionCamera's
high-level API:

1. **`constraints={[{ fps: 12 }]}` while aligning.** The camera session
   negotiates a format matching that fps for all its streams (preview +
   any attached output), so ML Kit only receives ~12 frames/sec instead of
   the sensor's native rate — directly cuts inference frequency, no
   worklets needed. Preview looks slightly less smooth during this phase,
   which is an acceptable trade for a "position yourself" screen.
2. **Detection is fully disconnected once locked**, not just ignored.
   Switched from the face-detector package's own `<Camera>` wrapper to the
   base `<Camera>` (`react-native-vision-camera`) + the `useFaceDetectorOutput`
   hook directly, so the `outputs` array can be controlled ourselves. Once
   `isLocked`, `outputs` becomes `[]` (verified via `useCameraSession.ts`/
   `useCameraController.ts` that changing `outputs` triggers a real
   `session.configure(...)` reconfiguration — this actually disconnects the
   native pipeline branch, not just silences the JS callback) — then a
   `setInterval` briefly re-enables it for ~1s every 10s to catch drift,
   per the "check every ~10s if still in frame" idea rather than running
   continuously through the whole answer.

Note: `outputs` and `constraints` are both memoized (VisionCamera's own
docs warn `outputs` must be stable or the session reconfigures every
render).

**Known caveat, not fixed now**: the `{ fps: 12 }` constraint currently
applies to the *entire* camera session, including preview. That's fine
while there's no recording feature, but once actual video recording is
built, this constraint must be scoped to the alignment phase only, and
lifted (or set to normal e.g. 24-30fps) once real recording starts — a
12fps recorded clip would look bad. Flagging this now so it isn't
forgotten when the recording feature is built.

Still needs re-verification on device — that's the next step.

`npx tsc --noEmit` passes clean.

### Step 6 continued — release build confirms real ML Kit cost, more tuning
Built and tested a Release APK (`builds/testimonial-video-v1.apk`, gitignored,
not committed) to isolate debug-mode JS overhead from genuine native
inference cost. Result: lag during aligning was about the same as debug -
confirms this is real ML Kit inference cost, not a JS-thread/debug-build
artifact.

Two more tuning changes, both cheap/low-risk (no architecture change):
- Dropped `ALIGNING_FPS_CONSTRAINT` from 12 to 8 - further cuts detection
  frequency.
- Added `minFaceSize: 0.25` to the face detector options. ML Kit searches
  across a range of face sizes by default (as small as 15% of frame
  width); raising this is ML Kit's own documented performance
  recommendation, since it shrinks the multi-scale search space. Kept
  below alignment.ts's 0.35 "too far" threshold so a too-distant face
  still gets a "move closer" message rather than "no face detected".

Not yet re-verified on device.

**Bigger options, not pursued yet** (real architecture changes, discussed
with the user but deferred pending these cheaper tweaks first):
- Camera hardware's own face-rectangle metadata (Camera2's
  `STATISTICS_FACES`, used for AF/AE) is essentially free but not exposed
  by VisionCamera's JS API - would need native module work.
- Detect-once-then-track cheaply between detections (optical flow or
  similar), only re-running full ML Kit detection periodically. ML Kit's
  `trackingEnabled` flag does NOT do this - it only assigns consistent
  IDs across full detections, doesn't reduce per-frame inference cost.
- A lighter, GPU-accelerated real-time model (e.g. MediaPipe BlazeFace)
  instead of ML Kit - meaningfully faster but requires dropping
  react-native-vision-camera-face-detector for the manual
  useFaceDetector()/frame-processor + tflite path.

`npx tsc --noEmit` passes clean.

### Step 5 — Guide overlay UI (done)
Added `AlignmentGuideOverlay.tsx`: an oval guide outline + status message +
"N/required" progress counter, absolutely positioned over the camera feed.
Uses React Native's built-in `Animated` (no new dependency) to fade opacity
to 0 over 400ms when `visible` goes false — per CLAUDE.md, "fades out
(smooth transition, not a hard cut)". Outline turns green when all three
signals pass. Message picks the single most relevant instruction
(distance > centering > headroom, in that priority order) rather than
listing all failing signals at once.

Wired into `App.tsx`: `visible={!isLocked}`, so the guide fades out the
moment the lock state machine reports locked — standing in for "recording
begins" until actual recording exists. `signals` state now also drives the
overlay (previously only used for the console log), throttled to update on
every detection callback for now; worth revisiting for perf on lower-end
hardware once we're testing frame rates on a real device.

`npx tsc --noEmit` passes clean.
