# Setup log — 2026-07-06 overnight session

## ⚠️ Project moved — read this first
The project directory moved from
`C:\Users\soham\Desktop\githubRepos\testimonial-app` to **`C:\dev\testimonial-app`**.

Reason: Windows has a 260-character `MAX_PATH` limit, and the original path was
long enough that the native (C++) build's generated object-file paths hit exactly
250 characters — right at the edge — causing a real build failure
(`ninja: error: manifest 'build.ninja' still dirty after 100 tries`, thrown by
`react-native-vision-camera-face-detector`'s CMake build). Enabling Windows'
long-path support would also fix this, but that's an admin-level registry change
(`HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled`) I didn't
want to make without asking. Relocating to a short path was the safe, reversible
fix, and cut the same path down to 222 characters — comfortable margin.

**The old copy still exists** at the original Desktop path — it couldn't be
deleted because VS Code had file-watcher locks on it (multiple `Code.exe`
processes were open). It's an exact duplicate as of the move, safe to delete
once you close any VS Code window pointing at the old location:
```
rmdir /S /Q "C:\Users\soham\Desktop\githubRepos\testimonial-app"
```
Also stale from earlier scaffolding and safe to delete any time:
`C:\Users\soham\Desktop\githubRepos\ta_scaffold`

**Open your editor/terminal at the new path (`C:\dev\testimonial-app`) going forward.**

## What was set up
- Expo SDK 57, React Native 0.86, React 19.2 (bare/dev-client workflow, not Expo Go)
- `react-native-vision-camera` **v5.1.0** — this is a major version newer than the
  commonly-documented v4 API. v5 is rebuilt on Nitro Modules (`react-native-nitro-modules`)
  and has a different hook-based API (`useCamera`, `usePreviewOutput`, `useCameraPermission`,
  `useMicrophonePermission`) than v4's single `<Camera>`-prop-bag style. If you search for
  help online later, check whether the answer is talking about v4 or v5 — they're not
  interchangeable.
- Frame processor stack (for later, not wired into any screen yet):
  - `react-native-vision-camera-worklets` + `react-native-worklets` (v5's worklets/runtime
    package — replaces the old `react-native-worklets-core` used by VisionCamera v4)
  - `react-native-vision-camera-face-detector@2.0.2` — ML Kit face detection, Nitro/v5-compatible
  - `react-native-fast-tflite@3.0.1` — for running a MediaPipe face-landmarker `.tflite` model
    in a frame processor (there's no separately maintained "MediaPipe landmarks" VisionCamera
    plugin — this tflite runtime is the actual integration path for that)
- `babel.config.js` created with `react-native-worklets/plugin` (required last, for frame processors)
- Camera + microphone permissions added directly in `app.json` (`ios.infoPlist`,
  `android.permissions`) — v5 has no Expo config plugin of its own, unlike some other
  native modules
- `App.tsx` — minimal screen: requests camera + mic permission, renders the front
  camera's live feed full-screen via VisionCamera's `<Camera>` component. No
  alignment/guidance/frame-processor logic wired in yet — intentionally out of scope
  for tonight, per your instruction to stop once the feed renders.
- `android.package` / `ios.bundleIdentifier` set to `com.zeistinteractive.testimonialapp`
  (placeholder — rename later if you want a different bundle ID before any store listing)

## Android native build ABI note
`android/gradle.properties` currently restricts the native build to:
```
reactNativeArchitectures=x86_64,arm64-v8a
```
`x86_64` covers the Android Studio emulator; `arm64-v8a` covers essentially all
modern real Android phones. This was narrowed from the default 4-ABI list
(`armeabi-v7a,arm64-v8a,x86,x86_64`) purely to keep dev builds faster. **Restore
the full list before any release build** — a release APK/AAB built with only
these two ABIs will not install on 32-bit ARM devices (rare, but some very
low-end/older phones in the target market may be 32-bit).

## Note on `/android`, `/ios` and git
`.gitignore` (Expo's default) excludes `/android` and `/ios` — the assumption is
these are regenerated via `npx expo prebuild` rather than hand-edited and committed
(the "Continuous Native Generation" approach, compatible with the bare/dev-client
workflow since we're already using a dev client, not Expo Go). This means the
`reactNativeArchitectures` ABI restriction in `android/gradle.properties` is a
**manual edit to a generated, gitignored file** — it will NOT be committed, and
will be silently lost if `expo prebuild --clean` is ever re-run. If that happens,
re-apply the ABI note above (or decide at that point whether you actually want to
commit `/android` instead, which is the alternative bare-workflow convention when
you expect to hand-edit native code regularly).

## Environment confirmed on this machine
- JDK 17 via Android Studio's bundled JBR (`C:\Program Files\Android\Android Studio\jbr`) —
  `JAVA_HOME` is NOT set globally, so it must be exported per build command until you
  set it permanently (see "Recommended follow-up" below)
- Android SDK at `%LOCALAPPDATA%\Android\Sdk`, `ANDROID_HOME` also not set globally
- NDK 27.1.12297006 and CMake 3.22.1 were auto-installed by this build (previously absent)
- Emulator AVD available: `Android_13_Pixel_6_API_33` (note: NOT named `Pixel_6_API_33` —
  the `.ini`/`.avd` pair has the `Android_13_` prefix)

## Recommended follow-up (not done tonight, didn't want to touch system state unattended)
- Set `JAVA_HOME` and `ANDROID_HOME` as permanent user environment variables so you don't
  need to export them by hand for every Gradle/adb command
- Consider enabling Windows long-path support (`LongPathsEnabled=1`) at some point anyway —
  it's a one-time, low-risk dev-machine setting many Node/Android workflows benefit from,
  but needs an admin-elevated terminal, so I left it for you to run deliberately

## ✅ Resolved: overnight build failure, and everything hit getting it running on a real phone
The background build kicked off after the move (targeting x86_64 + arm64-v8a)
had failed overnight. Note for future me: the task-completion notification said
"exit code 0" — that was misleading, it was the exit code of the wrapper's
trailing `echo`, not Gradle's. Always check the log content itself, not the
notification's exit code.

Root cause: `robocopy` carried over `android/build/`, `android/app/build/`,
various `.cxx` dirs, and `.gradle` execution-history caches under some
`node_modules/*/android` gradle-plugin projects — all from the old location.
Gradle saw them as already up-to-date and didn't regenerate them, but files
like `android/build/generated/autolinking/autolinking.json` had the **old
absolute path** hardcoded inside from the pre-move build. Fixed by deleting
all of it and letting Gradle regenerate clean:
```
rm -rf android/build android/app/build
find . -type d -name ".cxx" -exec rm -rf {} +
find node_modules -maxdepth 3 -type d -name build -path "*/android/*" -exec rm -rf {} +
rm -rf node_modules/@react-native/gradle-plugin/.gradle \
       node_modules/expo-dev-launcher/expo-dev-launcher-gradle-plugin/.gradle \
       node_modules/expo-modules-autolinking/android/expo-gradle-plugin/.gradle \
       node_modules/expo-modules-core/expo-module-gradle-plugin/.gradle
```

After that, running on a real phone (`npx expo run:android --device`) surfaced
two more environment gaps, both because `JAVA_HOME`/`ANDROID_HOME` aren't set
globally on this machine — fix by exporting per-session until set permanently:
```
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```
- `Gradle requires JVM 17 or later` → needed `JAVA_HOME` set to Android
  Studio's bundled JBR (17.0.6).
- `SDK location not found` → needed `ANDROID_HOME` set to the Android SDK path.

The build then succeeded and installed on the phone, but the app opened to the
dev-client's manual "connect to server" launcher screen instead of loading the
JS bundle automatically — the auto dev-server-connect step (via `adb reverse`)
didn't fire. Running `npx expo start --dev-client` and connecting manually
fixed the connection, but then bundling itself failed:
```
ERROR  TypeError: Cannot read properties of undefined (reading 'transformFile')
```
This is Metro silently swallowing a real error (`Bundler.js` catches transformer
construction failures and just logs `"Failed to construct transformer: "`
before continuing with `_transformer` left `undefined`). The actual error,
found by scrolling up in the log, was:
```
Failed to construct transformer:  Error: Cannot find module 'babel-preset-expo'
```
**Root cause**: `babel-preset-expo` (referenced in `babel.config.js`) was never
added to this project's own `package.json` — it only existed nested inside
`node_modules/expo/node_modules/babel-preset-expo`, which Node's module
resolution can't reach from a root-level `babel.config.js`. This was a gap in
the original scaffold merge, not something that broke later. **Fixed** by
adding `"babel-preset-expo": "~57.0.1"` to `devDependencies` and running
`npm install`, which hoists it to root `node_modules`.

With that fixed, `npx expo start --dev-client --clear` bundled successfully,
the app requested Camera + Microphone permission, and **the live front-camera
feed rendered correctly on a real phone** — the original task's stop condition
is met.

## Next steps
1. **Every new terminal session**, until `JAVA_HOME`/`ANDROID_HOME` are set
   permanently, export them first (see commands above) before any
   `gradlew`/`expo run` command.
2. Restore the full 4-ABI list in `android/gradle.properties`
   (`armeabi-v7a,arm64-v8a,x86,x86_64`) before any release build — currently
   narrowed to `x86_64,arm64-v8a` for faster dev builds, and this file is
   gitignored so the narrowing won't accidentally ship.
3. Delete the stale duplicate project folder at
   `C:\Users\soham\Desktop\githubRepos\testimonial-app` once no VS Code window
   still points at it.
4. Next real feature milestone (per CLAUDE.md's locked v1 architecture): wire
   up the first on-device CV check — face-landmark-based alignment/centering/
   distance via a frame processor, using either
   `react-native-vision-camera-face-detector` (ML Kit) or
   `react-native-fast-tflite` running a MediaPipe face-landmarker model. Worth
   deciding which before writing code, since the rest of the guidance stack
   (headroom, backlighting, re-lock) builds on the same landmark data.
