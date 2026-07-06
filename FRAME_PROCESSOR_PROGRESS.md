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
- [ ] 5. Build guide overlay UI with fade-out on lock/record start
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
