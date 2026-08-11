# Dev Notes

Consolidated from four superseded files (`FACE_DETECTION_LAG_INVESTIGATION.md`,
`FRAME_PROCESSOR_PROGRESS.md`, `HANDOFF.md`, `SETUP_LOG.md` — all deleted) once
the issues they tracked were resolved. This file keeps only what's still
actionable: gotchas that can recur, facts worth remembering, and one-paragraph
summaries of resolved investigations. Not a chronological log — add to the
relevant section below rather than appending a new dated entry.

## Known build/environment gotchas

**Windows `MAX_PATH` (260-char) limit breaks native builds — has recurred on multiple machines.**
Symptom: `ninja: error: manifest 'build.ninja' still dirty after 100 tries`,
usually from `react-native-vision-camera-face-detector` or
`react-native-fast-tflite`/`react-native-nitro-image`'s CMake build. Root
cause: generated native object-file paths exceed 260 characters.
- Enabling Windows' `LongPathsEnabled` registry setting does **not** fix it —
  `ninja.exe` has the limit hardcoded regardless.
- A directory junction doesn't fix it either — Gradle/Java resolve the alias
  back to the real long path before generating build paths.
- A `subst` virtual drive gets further but breaks a different Gradle step
  (a `providers.exec` call to Node in `settings.gradle`).
- **Actual fix**: keep the project at a genuinely short real path (e.g.
  `C:\dev\<project-name>`), not nested under Desktop/deep folder trees.

**`JAVA_HOME`/`ANDROID_HOME` not set globally** — export per-session until set as permanent user env vars:
```
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

**`android/gradle.properties`'s `reactNativeArchitectures` ABI list is gitignored.**
Narrowed to `x86_64,arm64-v8a` for faster dev builds — **must restore the full
`armeabi-v7a,arm64-v8a,x86,x86_64` list before any release build**, or it won't
install on 32-bit ARM devices. Since `/android` is gitignored entirely
(Continuous Native Generation — regenerated via `npx expo prebuild`, not
hand-edited/committed), this restriction is also silently lost on
`expo prebuild --clean` — re-apply it each time that's run.

**`babel-preset-expo` scaffold gap** — referenced in `babel.config.js` but can be missing from `package.json`'s own `devDependencies` (only present nested inside `node_modules/expo/node_modules`, unreachable from a root-level config). Symptom is misleading: Metro silently swallows the real error and just logs `"Failed to construct transformer: "` with nothing after it — scroll up in the log for the actual `Cannot find module 'babel-preset-expo'`. Fix: add it to `devDependencies` explicitly.

**A native (Kotlin) change to a patched library sometimes doesn't get picked up on a normal rebuild** — measured fps/behavior stays identical to the pre-edit numbers, revealing the build didn't actually recompile. Try a normal build first; if numbers come back identical, delete just that module's own `android/build` and `android/.cxx` folders and rebuild (targeted, fast) before reaching for `--rerun-tasks` (a much slower option that recompiles every module including `react-native-fast-tflite`'s C++ build — can take 16+ minutes).

**`patch-package` diffs get polluted with build-artifact noise** (has happened twice) if the patched module's `android/build`/`android/.cxx` folders aren't cleaned before running `npx patch-package <name>`. Always clean those first.

**Android only shows one system permission dialog at a time.** Requesting two permissions (e.g. camera + mic) from separate, independently-firing effects causes the second request to get dropped/stuck. Fix: sequence them — only request the second once the first has resolved. (See `PermissionsScreen.tsx`/`CameraAlignment.tsx` for the pattern already in use.)

**Moving the project directory can leave stale absolute paths baked into generated Gradle files** (e.g. `android/build/generated/autolinking/autolinking.json`), which Gradle treats as up-to-date and won't regenerate. Fix: delete `android/build`, `android/app/build`, all `.cxx` dirs, and any `node_modules/*/android/build` + related `.gradle` caches, then rebuild clean.

## Architecture facts worth remembering

- **`questionIndex` is 0-based internally but the backend's `question_index` field is 1-based.** Convert only at the `api.ts`/`upload.ts` boundary — don't let the conversion leak into app-level state.
- **`react-native-vision-camera` v5 is Nitro-Modules-based with a hook API** (`useCameraDevice`, `useCameraPermission`, `useMicrophonePermission`, `useVideoOutput`, `useFaceDetectorOutput`, etc.) — not v4's single `<Camera>` prop-bag style. If searching for help online, check which version the answer is actually about; they're not interchangeable.
- **`react-native-vision-camera-face-detector` streams `Face[]` to a plain JS callback** (`onFacesDetected`), not a worklet/frame-processor — normal `setState` works directly inside it, no `runOnJS` plumbing needed.
- **Face data shape**: `bounds: {x,y,width,height}` always available; `landmarks` (eyes, nose, mouth, cheeks, ears as `Point`s) only populated if `runLandmarks: true`; also available: `contours`, `pitch/roll/yawAngle`, `left/rightEyeOpenProbability`, `smilingProbability`, `trackingId`.
- **Landmarks are deliberately off** — tested twice (before and after the JS lag bug below was fixed) and confirmed a real ~30% fps cost (~19-22fps vs. the ~29-30fps baseline) both times. Not a fluke of the other bug. `alignment.ts`'s headroom check stays bounds-based; don't re-enable without a concrete new reason to re-test.
- **A lighter, GPU-accelerated model (e.g. MediaPipe BlazeFace via `react-native-fast-tflite`) was considered and deliberately deferred**, not rejected — it would mean dropping `react-native-vision-camera-face-detector` for a manual frame-processor + tflite pipeline (a much bigger rewrite: manual tensor preprocessing, anchor-box decoding, non-max suppression). Worth revisiting only if ML Kit's performance genuinely becomes a hard blocker.
- **`/android` and `/ios` are gitignored** (Continuous Native Generation) — regenerated via `npx expo prebuild`, not hand-edited/committed. Any manual native-file edit is silently lost on `expo prebuild --clean`.

## Resolved investigations

**Face detection lag (resolved).** Root cause: a broken `useMemo` dependency in `react-native-vision-camera-face-detector`'s own `useFaceDetectorOutput.ts` hook — a rest-spread object used as the memo dependency always produced a fresh reference, defeating the memo entirely, so the native ML Kit face detector was being torn down and rebuilt on every JS render. Fixed via a one-line `patch-package` patch to that single TS file — no native Kotlin code needed on either platform, since the bug was in shared cross-platform JS. Confirmed: steady ~29-30fps, no lag, alignment locks correctly. Patch lives in `patches/react-native-vision-camera-face-detector+2.0.2.patch`, auto-applied via the `postinstall` script already wired in `package.json`.

**Video upload OOM crash (resolved).** The initial upload implementation (`fetch(uri).blob()`) buffered the entire recorded video into memory before sending, which OOM-crashed on a real recorded video. Fixed by switching to `expo-file-system`'s native `File.upload()` in `upload.ts`, which streams from disk instead of buffering.

**Ambient noise check native crashes (resolved).** `expo-audio`'s `AudioRecorder` is a native SharedObject. Two rounds of crashes ("shared object already released", "JPromise was destroyed") were traced to (a) calling native methods with `.catch()` instead of a real `try/catch` — doesn't protect against a synchronous throw, which is how this specific failure surfaces — and (b) a permission race specific to question 1, where `expo-audio`'s own `requestRecordingPermissionsAsync()` could fire concurrently with VisionCamera's separate mic-permission request before `hasMic` was confirmed true. Fixed by wrapping every native call in real `try/catch` and gating the noise check on `hasMic`. See `useAmbientNoiseCheck.ts`.
