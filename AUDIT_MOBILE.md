# Mobile App Audit — factual status report

Scope: `C:\dev\video-testimonial` (the React Native/Expo mobile client only — no backend repo access). Branch at time of audit: `feature/ui-revamp-v2`. This is a description of what the code does, not what it's intended to do. No code was changed to produce this report.

---

## 1. Screens — implementation status and data source

| Screen | File | Status | Data source |
|---|---|---|---|
| Splash | `screens/SplashScreen.tsx` | Built | Static; dev-menu only, no real deep-link entry |
| WhatsApp invite | `screens/WhatsAppInviteScreen.tsx` | Built (UI only) | 100% hardcoded (`inviterName = 'Rajesh'`, `companyName = 'Vardaan Paints'`). Comment: "Mocked for now - a real invite token isn't wired yet." Reachable only from the `__DEV__`-gated dev menu |
| Identity confirm | `screens/IdentityConfirmScreen.tsx` | Built (UI only) | 100% hardcoded default identity (name/business/city/phone). Comment: "would come from the invite token once deep-linking is wired" |
| Onboarding | `screens/OnboardingScreen.tsx` | Built | Static copy, no backend |
| Consent | `screens/ConsentScreen.tsx` | Built (placeholder copy) | Static; own comment: "Placeholder consent copy... Final wording needs a compliance review before shipping, this is a v1 UI scaffold only" |
| Login | `screens/LoginScreen.tsx` | Built, functional | Real: calls `auth.ts` → `POST /login`. Username/password fields are pre-filled with a live test credential (`kumar` / `kumar123`) |
| Permissions | `screens/PermissionsScreen.tsx` | Built, functional | Real: reads live `useCameraPermission`/`useMicrophonePermission` state |
| Home | `screens/HomeScreen.tsx` | Built, functional | Mixed: question progress/counts are real (`videos.length`, `TOTAL_QUESTIONS`); `distributorName`/`businessName`/`city` are hardcoded in `AppFlow.tsx` (`"Mahesh Agrawal"`, `"Agrawal Traders"`, `"Nagpur"`); `PLACEHOLDER_QUESTIONS` array is hardcoded; "How to record well" videos, "Sample videos" carousel, and the "41 distributors have already finished" stat line are all hardcoded with no playback wired |
| My Videos | `screens/MyVideosScreen.tsx` | Built, functional | Real: `GET /distributors/me/segments` + `GET /distributors/me/rendered-videos` via `myVideos.ts` |
| Question Brief | `screens/QuestionBriefScreen.tsx` | Built, functional | Question text/talking points are hardcoded placeholders in `AppFlow.tsx`; VO audio is real (bundled per-question MP3s in `assets/audio/`); `SAMPLE_ANSWERS` list is hardcoded with no backend source and no playback wired |
| Rehearse | `screens/RehearseScreen.tsx` | Built, functional | Real camera preview; explicitly never calls record — practice takes are structurally never persisted |
| Camera Check | `screens/CameraCheckScreen.tsx` | Built, functional | Real: live alignment/distance/sound signals from `CameraAlignment.tsx` |
| Recording | `screens/RecordingScreen.tsx` | Built, functional | Real recording; elapsed-time ticker is a local `setInterval`, not read from the recorder ("Fake elapsed-time ticker" per its own comment) |
| Review & Trim | `screens/ReviewTrimScreen.tsx` | Built, functional | Real local video file playback (`expo-video`); trim in/out points are metadata only — no media is actually cut anywhere in the app |
| Uploading | `screens/UploadingScreen.tsx` | Built, functional | Real: drives `upload.ts`'s presigned-URL PUT + confirm sequence |
| Confirmation | `screens/ConfirmationScreen.tsx` | Built | Static copy, reached after a real successful upload |
| Video Player | `screens/VideoPlayerScreen.tsx` | Built, functional | Real local/remote playback, real WhatsApp share sheet, real "save to gallery" via `expo-media-library` |
| My Videos retake confirm | `screens/RetakeConfirmOverlay.tsx` | Built, functional | Real |
| Help | `screens/HelpScreen.tsx` | Built (content only) | 100% hardcoded: quick tips, "how to" video list, sample videos, FAQ — no playback, no backend |
| Profile | `screens/ProfileScreen.tsx` | Built (UI only, no persistence) | 100% mock/local `useState`. Own comment: "Mock data only - no real account backend wired yet." The "Edit these details" sheet's Save button only closes the sheet — edits live in component state and are lost on remount/reload |
| Bottom tab bar | `screens/BottomTabBar.tsx` | Built, functional | 4 tabs: Home, My videos, Help, Profile. Help tab icon is a placeholder glyph per its own comment |

**Summary:** the recording/camera-check/review/upload/My-Videos pipeline is real end-to-end. Everything upstream of it (invite → identity → onboarding → consent) and the Profile screen are UI scaffolding over hardcoded/mock data with no backend wiring. Home mixes real progress state with hardcoded identity and marketing content.

---

## 2. Auth implementation

- `auth.ts` + `api.ts`: real JWT bearer-token auth against a live backend.
  - `login(username, password)` → `POST /login`, stores the returned JWT via `expo-secure-store` under key `auth_token`.
  - `restoreSession()` runs once on launch, calls `GET /me` to validate the stored token is still live (not just present) before skipping login.
  - `logout()` clears the token from SecureStore and from the in-memory `api.ts` module state.
  - No refresh-token flow — tokens are described in `API_CONTRACT.md` as 30-day JWTs with no renewal mechanism visible in this repo.
- **No self-serve account creation exists anywhere in the app.** `LoginScreen.tsx`'s own comment: "there's no self-serve account creation, distributors are provisioned backend-side."
- **Invite-token provisioning does not exist in any form.** `WhatsAppInviteScreen.tsx` and `IdentityConfirmScreen.tsx` are both fully mocked screens with hardcoded default data and explicit comments that a real invite token / deep link is not wired. There is no deep-link handling, no token-parsing code, and no route from a WhatsApp link into the app anywhere in the codebase. The only way to reach these screens is the `__DEV__`-gated `DevEntryMenu` on the login screen, which just calls `setScreen(...)` directly.
- **Hardcoded live credentials in source**: `LoginScreen.tsx` pre-fills `username: 'kumar'`, `password: 'kumar123'` as component default state. This is a real, working seeded test account per `API_CONTRACT.md` ("one of the 5 seeded test accounts"), shipped in the UI's default field values.
- **No in-app account deletion.** No "delete account" UI, no corresponding API call, confirmed by repo-wide search — no match for delete-account-style code anywhere.

---

## 3. Native dependencies and iOS status

From `package.json`:

| Package | Version | iOS support | iOS setup done? |
|---|---|---|---|
| `expo` | ~57.0.2 | Yes (official) | N/A (framework) |
| `expo-audio` | ~57.0.0 | Yes (official) | Requires `NSMicrophoneUsageDescription` — present in `app.json` |
| `expo-dev-client` | ~57.0.5 | Yes (official) | — |
| `expo-file-system` | ~57.0.0 | Yes (official) | — |
| `expo-font` | ~57.0.0 | Yes (official) | — |
| `expo-media-library` | ~57.0.3 | Yes (official) | Config plugin present in `app.json` with `photosPermission`/`savePhotosPermission` strings — these generate the iOS `NSPhotoLibraryUsageDescription`/`NSPhotoLibraryAddUsageDescription` Info.plist keys **only when `expo prebuild` is run for iOS**, which has never happened (see §4) |
| `expo-secure-store` | ~57.0.1 | Yes (official) | — |
| `expo-splash-screen` | ~57.0.2 | Yes (official) | — |
| `expo-status-bar` | ~57.0.0 | Yes (official) | — |
| `expo-video` | ~57.0.0 | Yes (official) | — |
| `react-native-vision-camera` | ^5.1.0 | Yes — package ships `ios/` + podspec with explicit `s.platforms = { :ios => min_ios_version_supported, :visionos => 1.0 }` | Never verified — no `ios/` project exists to check Podfile linkage against |
| `react-native-vision-camera-face-detector` | ^2.0.2 | Yes — package ships `ios/` + podspec | Locally patched via `patches/react-native-vision-camera-face-detector+2.0.2.patch` (fixes a JS-side `useMemo` re-creation bug in `useFaceDetectorOutput.ts`; the patch itself is platform-agnostic JS, applies equally on iOS) |
| `react-native-vision-camera-worklets` | ^5.1.0 | Yes — ships `VisionCameraWorklets.podspec` (no `ios/` folder; native code is under `cpp/`/`nitrogen/`, shared-C++/Nitro style, not iOS-specific missing) | Unverified |
| `react-native-worklets` | 0.10.0 | Yes — ships `apple/` (not `ios/`) + `RNWorklets.podspec` | Unverified |
| `react-native-fast-tflite` | ^3.0.1 | Yes — ships `ios/` + podspec | **Declared as a dependency and as an `app.json` config plugin, but is not imported or called anywhere in the app's own code** (no `useTensorflowModel`/`loadTensorflowModel` reference found in any `.ts`/`.tsx` file). Dead weight in the current build — adds a native iOS dependency for a feature that isn't used |
| `@expo-google-fonts/noto-sans`, `@expo-google-fonts/plus-jakarta-sans` | ^0.4.2 | Yes (JS/font assets, no native code) | — |

**Overall**: every native dependency in the tree ships iOS-capable native code (podspecs exist for all of them, directly or transitively via `react-native-nitro-modules`/`react-native-nitro-image`, which also ship `ios/` + podspecs). Nothing here is Android-only at the package level. But none of it has been exercised on iOS — see §4.

---

## 4. Has this project ever been built for iOS?

**No.**

- No `ios/` directory exists anywhere in the repo or working tree.
- `.gitignore` treats both `/ios` and `/android` as "generated native folders" (i.e., an Expo bare/dev-client prebuild workflow) — neither is meant to be committed. Only `android/` currently exists on disk, meaning `expo prebuild`/`expo run:android` has been run locally at least once; the equivalent for iOS has not.
- `.expo/devices.json` records two generic `installationId` entries with no platform field distinguishing iOS vs. Android — no evidence of an iOS device or simulator session.
- No `Podfile`, `Podfile.lock`, `.xcodeproj`, `.xcworkspace`, or any iOS deployment-target setting exists anywhere in the repo.
- `git log --all --diff-filter=A --name-only -- 'ios/*'` returns nothing — an `ios/` directory has never been committed at any point in this repo's history (44 commits total).
- No iOS-specific code paths exist in the app's own source. The only iOS-aware code is *documentation of what would need to happen on iOS but hasn't been verified*, e.g. `session.ts`'s comment on `purgeOrphanedRecordingTempFiles()`: "iOS has no equivalent here... an orphaned iOS temp file can't be positively located from JS to delete proactively... this is still cleaned up, just by the OS rather than by us" — reasoned from documentation, not confirmed on-device.
- `DECISIONS.md` (OPEN → Deferred) lists "Background upload survival (iOS URLSession background / Android WorkManager) — unverified whether the app supports it" as an open, unverified item.

**Conclusion**: iOS buildability is theoretical, based on all native dependencies advertising iOS support in their package metadata. It has never actually been compiled, run, or tested on iOS or the iOS Simulator.

---

## 5. Declared permissions and purpose strings

### Android (`app.json` + generated `android/app/src/main/AndroidManifest.xml`)

Declared in `app.json`'s `android.permissions`:
- `android.permission.CAMERA`
- `android.permission.RECORD_AUDIO`

Actually present in the generated `AndroidManifest.xml` (broader than the `app.json` list, because Expo/Metro/library autolinking add their own):
- `CAMERA`
- `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK` (from `expo-audio`'s media session service)
- `INTERNET`
- `MODIFY_AUDIO_SETTINGS`
- `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` (both capped `maxSdkVersion="32"` — from `expo-media-library`)
- `RECORD_AUDIO`
- `SYSTEM_ALERT_WINDOW`
- `VIBRATE`

Android has no manifest-level "purpose string" mechanism (that's an iOS/App Store concept) — Android permission rationale, where shown, is handled in-app. See `CameraAlignment.tsx`'s and `PermissionsScreen.tsx`'s own in-app copy (§6/§1) for the user-facing explanations actually shown.

### iOS (declared only in `app.json`, never materialized into a real `Info.plist` — see §4)

```
NSCameraUsageDescription: "This app needs camera access to record your testimonial video and provide real-time framing guidance."
NSMicrophoneUsageDescription: "This app needs microphone access to record audio for your testimonial video."
```

Via the `expo-media-library` config plugin block:
```
photosPermission: "Allow $(PRODUCT_NAME) to save your finished branded video to your photos."
savePhotosPermission: "Allow $(PRODUCT_NAME) to save your finished branded video to your photos."
```
These map to `NSPhotoLibraryUsageDescription` / `NSPhotoLibraryAddUsageDescription` — but again, only once an iOS prebuild is actually run.

**Discrepancy worth flagging**: `CLAUDE.md` states the recording flow needs "no gallery/MediaLibrary permission" since `react-native-vision-camera` writes to app sandbox storage. That's true for the *recording* path. But `VideoPlayerScreen.tsx`'s "Save to phone" button (celebratory/branded-reel playback) does call `expo-media-library`'s `requestPermissionsAsync()` + `saveToLibraryAsync()` — a real, separate MediaLibrary/photo-library permission request exists in the app for that one feature, contradicting the "no gallery permission needed" framing as a whole-app statement.

---

## 6. Recording, CV coaching, compression, upload flow

### State machine
`AppFlow.tsx` is a hand-rolled state machine — string-union `Screen`/`QuestionPhase` types plus `useState`, not React Navigation. Question flow phases: `brief → rehearse (optional) → cameraCheck → countdown → recording → reviewTrim`. Hardware back button is handled manually via a `BackHandler` listener that maps current `screen`/`phase` to an explicit target (`AppFlow.tsx` lines ~345–408); phases with no in-app back affordance (cameraCheck/countdown/recording/reviewTrim) route to a confirm-exit dialog rather than blocking or silently exiting.

### Recording (`CameraAlignment.tsx`)
- Real: front camera via `react-native-vision-camera`, video output via `useVideoOutput({ enableAudio: true })`, records to a temp file in app-private storage (no gallery permission for this path).
- Face detection via `react-native-vision-camera-face-detector` (ML Kit), `bounds`-only (landmarks explicitly disabled — measured ~30% fps regression, see code comment), `performanceMode: 'fast'`, `minFaceSize: 0.25`.
- Alignment lock: `useAlignmentLock.ts` — 40 consecutive good frames required before question 1 (`'initial'`), 20 for the lighter recheck on questions 2–5 (`'recheck'`), frame-count-based not time-based.
- Ambient noise: `useAmbientNoiseCheck.ts` — real mic amplitude sampling via `expo-audio`, dBFS threshold `-25`, 1s warm-up, 2s sustained-noisy window before a "skip anyway" override appears. Never records or persists audio, only reads live metering.
- **What is NOT implemented from CLAUDE.md's v1 CV scope**: no brightness/backlighting detection (`RecordingScreen.tsx` comment: "brightness detection was never built, and a fake indicator would be worse than none"); no background-complexity/clutter detection (no Selfie Segmentation usage anywhere in the repo); no device-orientation sensor check; no shake/accelerometer check. The only real-time checks implemented are: face-bounds containment ("centered"), face-width ratio ("distance"), vertical headroom ratio, and mic amplitude ("sound"). CLAUDE.md's "flag mid-answer alignment breaks for a redo prompt" is also not implemented — detection is fully suspended during active recording, by design, per `CameraAlignment.tsx`'s own comment.

### Compression
**No compression step exists anywhere in the client.** Repo-wide search for "compress" returns zero matches. Recorded video is uploaded as-is at whatever bitrate/resolution the device's `Recorder` produces. `DECISIONS.md` lists "Recording quality / bitrate reduction — ~100MB per minute is high" as a real, unaddressed, deferred item.

### Upload (`upload.ts`)
- Real two-step flow matching `API_CONTRACT.md`: `POST /segments/upload-url` → raw `PUT` of file bytes directly to the presigned S3 URL via `expo-file-system`'s `File.upload()` (native streaming, chosen specifically to avoid an earlier OOM crash from buffering the whole file in memory) → `POST /segments/confirm`. One automatic retry of the whole sequence if `confirm` returns `video_not_found` (per contract, that specifically means the PUT never landed).
- **Not background, not resumable.** This is a plain foreground `fetch`/`File.upload()` sequence run inside a React `useEffect` while the `'uploading'` screen is mounted. There is no `react-native-background-upload`, no `tus`-based client, no byte-offset resume — none of these packages are in `package.json`. If the app is backgrounded or killed mid-upload, the in-flight request is simply lost; on relaunch, `session.ts`'s `uploadedQuestionIndices` lets the *sequence* resume from the next un-confirmed segment (skipping already-confirmed ones), but the specific request that was interrupted is retried from scratch, not resumed byte-for-byte. This contradicts CLAUDE.md's locked requirement for a background + resumable (byte-offset) upload client. `DECISIONS.md` itself flags this as unverified/deferred: "Background upload survival (iOS URLSession background / Android WorkManager) — unverified whether the app supports it."

### What persists across a crash/force-quit (`session.ts`)
A single synchronous local JSON file (`session-state.json` in app document storage), written on every relevant state change, not just screen transitions. Persisted: current screen (collapsed to `'main' | 'question' | 'uploading'`), active tab, question index, question phase, retake target, all finalized `videos`, in-progress `takesByQuestion`, selected take, trim metadata, `autoStart` preference, `hasSubmittedBatch`, `uploadConfirmed`, and `uploadedQuestionIndices` (which segments are already confirmed in the current upload batch).

Explicitly **not** resumable: the `countdown` and `recording` phases — if force-quit mid-capture, `handleRecordingFinished` never ran, so nothing about that take exists in JS state to restore; on relaunch, `purgeOrphanedRecordingTempFiles()` deletes the orphaned Android temp file (matched by VisionCamera's `VisionCamera_*.mp4` naming convention in the cache dir) and the app lands back on `'brief'` for the same question. The equivalent iOS temp file cannot be located/deleted from JS (different temp-directory scheme, no matching handle) — per the code comment, that's left to iOS's own documented purge of `NSTemporaryDirectory` on next launch, not verified against real iOS behavior since iOS has never been run (§4).

Explicitly not persisted (by design, per `session.ts`'s own comment): pre-session screens (login/onboarding/consent/permissions) and ephemeral UI-only state (countdown ticker, popups, My Videos' server-fetched rows).

---

## 7. Bundle identifiers, version numbers, signing

- **Bundle ID (both platforms, same value)**: `com.zeistinteractive.testimonialapp` — set in `app.json` for both `ios.bundleIdentifier` and `android.package`, and mirrored in the generated `android/app/build.gradle` (`namespace`, `applicationId`).
- **Version**: `app.json` and `package.json` both report `"version": "1.0.0"`.
- **Android versionCode**: `1` (hardcoded literal in `android/app/build.gradle`, not derived from `app.json`).
- **iOS build/version numbers**: none exist — no `Info.plist`/`project.pbxproj` has ever been generated (§4).
- **Signing**:
  - Android `debug` build type signs with a committed convention: `debug.keystore`, hardcoded `storePassword: 'android'`, `keyAlias: 'androiddebugkey'`, `keyPassword: 'android'` — this is the standard Android SDK debug keystore, not a secret in practice (its password is a public, universal default), but note it's referenced with plaintext credentials directly in the build file.
  - Android `release` build type **also signs with `signingConfigs.debug`** — i.e., there is currently no separate release keystore configured. The gradle file's own comment: "Caution! In production, you need to generate your own keystore file." A release build today would ship signed with the debug key, which the Play Store rejects and which is not appropriate for any real distribution build.
  - No iOS signing configuration exists (no provisioning profile, no certificate references, no `ExportOptions.plist`) — expected, since no iOS project exists.

---

## 8. In-app account deletion

**Does not exist.** Confirmed by direct code search (no match for delete-account-style code anywhere in the repo) and by reading `ProfileScreen.tsx` in full — its "Account" section only shows read-only Phone/Distributor ID/Distributor-for rows and links to "Consent and privacy" and "Log out." There is no delete/deactivate account affordance, no corresponding API call, and no such endpoint referenced anywhere (`api.ts` only exposes generic `apiGet`/`apiPost`, and `API_CONTRACT.md` — the documented endpoint list — has no account-deletion route).

---

## 9. TODO / FIXME / HACK / mock / dummy inventory

Repo-wide search for `TODO|FIXME|HACK|XXX` found **one** literal hit, which is a redacted phone-number placeholder, not a code marker:
- `screens/IdentityConfirmScreen.tsx:27` — `phone: '+91 98XXX XXXXX'` (masked default value, part of the mocked identity object)

There are no `TODO`, `FIXME`, or `HACK` comments anywhere in the tracked source. The codebase instead documents known-mock/placeholder status inline via prose comments. Full inventory of those, by file and line:

| File : line | What's marked mock/placeholder |
|---|---|
| `AppFlow.tsx:92` | "side is on mock data - the backend currently only accepts question [indices 1-3]" |
| `AppFlow.tsx:96` | `PLACEHOLDER_QUESTIONS` array (all 5 questions hardcoded) |
| `AppFlow.tsx:103` | `PLACEHOLDER_TALKING_POINTS` array |
| `AppFlow.tsx:110` | `PLACEHOLDER_PROMPTS` array |
| `AppFlow.tsx:523` | "Fake elapsed-time ticker while 'recording'" |
| `AppFlow.tsx:814–815` | "Mock identity - no real account backend wired yet" (hardcoded `distributorName`/`businessName`/`city` passed to `HomeScreen`) |
| `screens/WhatsAppInviteScreen.tsx:11` | "Mocked for now - a real invite token isn't wired yet" |
| `screens/IdentityConfirmScreen.tsx:18` | "Mocked for now - would come from the invite token once deep-linking is wired" |
| `screens/ProfileScreen.tsx:21–22` | "Mock data only - no real account backend wired yet" |
| `screens/ProfileScreen.tsx:32–33` | "Settings-only mock toggles - no notification/network-policy backend wired yet" |
| `screens/QuestionBriefScreen.tsx:33–34` | `SAMPLE_ANSWERS` — "no playback wired yet, no backend source for these exists" |
| `screens/RecordingScreen.tsx:51–52` | "No 'light' quality chip... brightness detection was never built" |
| `screens/HomeScreen.tsx:42–51` | `HOW_TO_VIDEOS`, `SAMPLE_VIDEOS` — hardcoded arrays, no playback |
| `screens/HomeScreen.tsx:196` | "41 distributors have already finished all five questions" — hardcoded stat, no backend count |
| `screens/HelpScreen.tsx:25–44` | `QUICK_TIPS`, `HOW_TO_VIDEOS`, `SAMPLE_VIDEOS`, `FAQS` — all hardcoded |
| `screens/LoginScreen.tsx:22–23` | Hardcoded seeded test credentials as default field values (`kumar`/`kumar123`) |
| `screens/BottomTabBar.tsx:37` | "Basic placeholder glyph" (Help tab icon) |
| `DECISIONS.md:130–132` | Project's own tracked item: "Profile edit persistence... currently only updates local mock state, nothing is saved to a backend" |

Additionally, `react-native-fast-tflite` is a fully unused dependency (declared, never imported/called — see §3).

`.claude/worktrees/agent-a652020cb3eac7aac/` is a stray, git-tracked full duplicate of the repo (an old agent worktree) sitting inside `.claude/`. It contains its own copies of the same mock/placeholder comments listed above and is not part of the app's build (Metro doesn't resolve app code from `.claude/`), but it is committed to git and inflates the tree.

---

## 10. Hardcoded values that would break outside this machine

- **`.env.local:1`** — `EXPO_PUBLIC_API_BASE_URL=http://192.168.1.113:3000`. A LAN IP specific to whichever machine is currently running the backend on the office network. `.env*.local` is gitignored, so this specific file won't be committed, but the *pattern* is fragile by design: `API_CONTRACT.md` documents this is intentional for the current "same-network, not deployed" phase ("find the IP by running `ipconfig`... confirm with whoever's running the backend") — i.e., every developer/tester must manually discover and hand-edit this value, and it will silently stop working the moment the backend machine's IP changes or the phone is on a different network. `api.ts` throws a clear runtime error if the var is unset, but not if it's set-and-wrong/unreachable — that surfaces only as a generic `ApiError(0, 'network_error', ...)`.
- **`screens/LoginScreen.tsx:22-23`** — hardcoded working credentials (`kumar` / `kumar123`) as default field state, shipped in source, not behind any dev-only gate (unlike the invite-flow dev menu, which is `__DEV__`-gated). Anyone building this app as-is gets a pre-filled login screen for a real seeded account.
- **`android/app/build.gradle`** — debug keystore path/passwords hardcoded (`debug.keystore` / `'android'` / `'androiddebugkey'` / `'android'`). This is the standard, universally-known Android debug keystore convention, not a real secret, but it's worth noting the release build type currently reuses this same debug signing config (§7) — a real, machine-independent problem (not "breaks on another machine" but "produces an unshippable artifact everywhere").
- No absolute filesystem paths (e.g., `C:\...`, `/Users/...`) were found hardcoded in any `.ts`/`.tsx` source file.
- No embedded API keys, tokens, or other credential material were found in source beyond the login prefill above.
- `.claude/worktrees/agent-a652020cb3eac7aac/` (see §9) is a machine/session-specific artifact that has been committed to git — not something another developer's checkout should contain.
