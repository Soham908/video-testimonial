# Laptop handover — video testimonial mobile frontend

Prepared **2026-10-26** for moving development to another laptop. This replaces the 2026-09-04 handoff. The implementation reviewed is commit **`65375b2dd8d702854b53639133663ab4decb2fc1`**, dated 2026-09-18; the handover commit adds documentation and carries forward the October audit. Check `git log` for later implementation changes.

## 1. Start here on the new laptop

- Repository: [Soham908/video-testimonial](https://github.com/Soham908/video-testimonial).
- Working branch: **`feature/ui-revamp-v2`**. Clone this branch explicitly; do not assume the default branch contains this work.
- Recommended Windows checkout path: **`C:\dev\video-testimonial`**, or another genuinely short real path. Long Windows paths have repeatedly broken native CMake/Ninja builds.
- This repository contains the **React Native mobile frontend**. Backend and dashboard need their own checkouts, environments, and handovers; their repositories were not available here.
- Read this file, [AGENTS.md](AGENTS.md), [DECISIONS.md](DECISIONS.md), then [AUDIT_REPORT.md](AUDIT_REPORT.md). Use [DEV_NOTES.md](DEV_NOTES.md) for build troubleshooting and [API_CONTRACT.md](API_CONTRACT.md) for the copied backend contract.
- This is an internal-testing build with working capture/upload paths and known defects. The audit is a backlog, **not a record of fixes already implemented**.

Git carries source, tracked assets, dependency lockfile, face-detector patch, config plugin, and context documents. It does not carry this chat's history, credentials, generated native projects, emulator state, or recordings saved inside a phone's app sandbox.

## 2. Product context and decisions to preserve

Soham is building an app for large Indian distributor/franchise networks, at an IFB/Aditya Birla scale. Distributors record their own testimonial answers; on-device camera guidance is intended to make usable footage possible without a professional shoot. The wider product turns uploads into branded video reels and transcript-based sentiment/themes/aggregated insights.

Soham makes product decisions and performs device QA; the coding agent implements. Previous experience includes nexrender/After Effects template rendering at roughly 100,000-video scale. Prefer the simplest v1 implementation that meets a real requirement. When asked to decide, make one recommendation with reasons. Preserve established work rather than rebuilding a working camera pipeline during a laptop move.

Important decisions:

- **One file per question**, with per-question recording/review/retakes. No continuous interview recording.
- **Manual, confirmed batch upload**. Keeping a take saves locally; it does not submit it.
- The server receives **one selected primary take per question**. Keeping a second local take does not mean uploading both.
- Rehearsal is intended to be private practice and never saved. A verified implementation bug violates this; see F02 below.
- Target users include budget/mid-range Android devices and patchy tier-2/3 connectivity. Offline recovery, memory, and resumable transfer matter.
- Camera quality checks should run on-device. Cloud semantic scene recognition, live transcription/captions, continuous takes, and dynamic follow-up questions remain outside v1.
- Transcription and analytics are server-side after upload. Rendering and analytics are intended to be independent processing paths.
- The intended audio sequence is **complete question VO → five-second countdown → recording**, because reliable acoustic echo cancellation cannot be assumed. Current sequencing still needs repair.
- Questions are **backend-configured per client**. Five was the initial-client scope; actual count/order/content must come from the endpoint.
- Current product direction is per-question reels. A possible seven-question split into three branded and four survey answers, including whether branded clips should merge, remains a product decision. Do not implement that from old discussion alone.

## 3. What is implemented in this checkout

| Area | Current behavior |
|---|---|
| Authentication | Seeded username/password login, plus flag-controlled phone/password registration and sign-in for internal testers. JWT in SecureStore; `/me` checks identity. No password-reset/OTP flow exists in the documented internal-testing contract. |
| Entry and consent | Onboarding and consent screens exist. Local acknowledgement uses distributor ID; returning consented users skip repeated onboarding. Full terms/compliance review remain unfinished. Invitation/deep-link entry screens are simulations behind a development menu. |
| Questions and languages | Server question text, talking points, VO URLs, ordering, and count. English/Hindi/Marathi UI and a local language override are shipped. VO keys include question ID and language. The old handoff's “language picker not built” note is obsolete. |
| Camera | VisionCamera v5 capture plus ML Kit face detection. Bounds-based centering, distance, and headroom; ambient microphone metering. Landmarks intentionally disabled after measured performance cost. Initial/recheck locks are currently **40/20 consecutive good frames**. |
| Capture | Portrait app; FHD 16:9 target, 30 fps, 3 Mbps video bitrate, H.264 request. These are negotiated targets, not guaranteed output. Actual format/metadata are logged or collected. |
| Review and takes | Mandatory Review & Trim; up to three fresh pending takes, dropping the oldest; up to two kept takes per question, each with its own trim and primary selection. A simple retake currently keeps both old/new when there is room, generally selecting the new one as primary. This default was a judgment call, not a settled request to force replacement. |
| Trimming | Metadata only. No on-device video trimming/ffmpeg pipeline. Start/end are sent in milliseconds during confirm; the uploaded file is the original capture. |
| Storage/recovery | Completed captures move to private documents. JSON saves flow, takes, trims, and completed upload question indices. Recovery exists but has serious audit defects; its existence does not establish robustness. |
| Upload | Sequential native PUTs to presigned URLs, then API confirm. Disk streaming avoids a full JS blob. Retries a segment once for `video_not_found`. Android foreground-service keepalive exists. Completed questions can be skipped on resume; **interrupted files do not resume at byte offset**. |
| Library | My Videos merges local takes with server segments and optional rendered reels. Local/remote playback exists. Reopening the tab refreshes server state; no push-notification system exists. |
| UI | Home / My Videos / Help / Profile tabs; theme tokens/fonts/components; safe areas, Android nav-bar adjustments, first-run hints, anchored tooltips. Several sample/help/profile controls remain mock content. |
| Version gate | Profile `min_app_version` is compared with native version. An update-required screen blocks older versions; current store action is Android-specific. |

**Not implemented despite some older architecture prose:** lighting/backlight analysis, shake/background-complexity analysis, and post-answer alignment-break detection. Detection is suspended during actual recording. Installed/configured `react-native-fast-tflite` does not mean a replacement GPU face/background pipeline has been built.

Reel rendering is **off by default** because the branded template is not ready. An empty rendered-videos response is expected while off. Export UI needs fixes before enabling it.

## 4. Code map for the next implementation session

| Files | Responsibility / things to watch |
|---|---|
| `index.ts`, `App.tsx` | Root registration, fonts, error boundary, theme/safe-area/tooltip providers. |
| `AppFlow.tsx` | Custom state machine: bootstrap/auth, tabs, question phases, take keeping, uploads, persistence, library rows. No React Navigation stack. Most lifecycle bugs cross this file and a helper module. |
| `CameraAlignment.tsx` | Permissions, native outputs, detector/noise checks, lock advancement, recorder handle, capture metadata. Keep the camera mounted through check/countdown/recording. |
| `alignment.ts`, `useAlignmentLock.ts`, overlays | Bounding-box quality rules, guide geometry, good-frame streak, presentation. |
| `useAmbientNoiseCheck.ts` | Expo Audio metering lifecycle; readiness and incidental-file-retention findings. |
| `recordings.ts`, `session.ts` | Take model; moving/deleting private MP4s; checkpoint and interrupted-capture cleanup. Current takes store array position rather than stable question ID. |
| `api.ts`, `auth.ts` | Base URL, JSON/bearer wrapper, error/expiry dispatch; login/register/restore/logout. |
| `questions.ts`, `voCache.ts` | Server question DTOs, question cache, language/revision-aware VO downloads. |
| `upload.ts` | Presign → native PUT → confirm; trim/capture metadata. Do not replace disk streaming with `fetch(fileUri).blob()`: that previously OOM-crashed on a real clip. |
| `myVideos.ts`, `distributorProfile.ts`, `appVersion.ts` | Library DTOs/cache, profile/minimum-version response, version comparison. |
| `consent.ts`, `preferences.ts`, `firstRunTips.ts` | Consent IDs, language/read-aloud preferences, seen tips. |
| `screens/` | Login, onboarding, brief, rehearsal, check, recording, trim, uploads/library/player/profile/help. |
| `theme/`, `components/ui/`, `i18n/`, `tooltips/` | Shared appearance, controls, translations, contextual help. Use existing locale files and tokens/components. |
| `patches/`, `babel.config.js`, `plugins/` | Required dependency patch, worklets Babel plugin, Android upload-service configuration. These must survive cloning/building. |

Question phases are `brief → cameraCheck → countdown → recording → reviewTrim`, with a rehearsal branch. Keeping a take offers the next question/Home/My Videos. Hardware back handling is manual. Upload state is independent of the visible upload screen so returning Home need not stop a batch.

## 5. Frontend/backend integration context

[API_CONTRACT.md](API_CONTRACT.md) is copied mobile-facing documentation, not backend source. Verify its details against the backend checkout during integration.

| Endpoint | Frontend use |
|---|---|
| `POST /login` | Seeded username/password → `{ token }`. |
| `POST /register`, `POST /login/phone` | Tester phone/password auth; independent backend flag. |
| `GET /me` | `{ auth: { distributor_id, client_id } }`. |
| `GET /distributors/me` | `{ distributor: ... }`; consumes name, phone, `min_app_version`. |
| `GET /distributors/me/questions` | Optional `language` query: en/hi/mr. `{ questions: [...] }`; override is per call, not written to the profile. |
| `POST /segments/upload-url` | Backend `question_index` → `{ upload_url, video_key }`. |
| `PUT upload_url` | Raw file directly to storage. Do not send the API bearer header. |
| `POST /segments/confirm` | Question index, duration in seconds, trim in milliseconds, optional capture metadata. |
| `GET /distributors/me/segments` | `{ segments: [...] }`, not a bare array. |
| `GET /distributors/me/rendered-videos` | `{ rendered_videos: [...] }`; playback URL may be null until rendered. |

App `questionIndex` is a **0-based array position**. API `question_index` must be the DTO's actual `index`, not assumed position + 1. Stable question `id` survives reorder; positional take storage is a known problem. The contract says confirm upserts by distributor/question, ignores client `idempotency_key`, and derives storage key server-side. Read the real route before recreating different assumptions.

VO/playback URLs are temporary presigned URLs. Refresh from the API; they are not permanent public links. `updated_at` drives cache freshness, with existing defects in F07/F10.

Confirm storage/processing against the backend: AGENTS describes R2 and planned Chirp/Whisper/analysis choices; the contract and older notes refer to S3 and a different experimental sentiment stack. The mobile app consumes the returned URL. This handover does not certify a live provider, model, worker, or dashboard configuration.

## 6. New Windows laptop setup

### 6.1 Install and authenticate

Install Git, compatible Node/npm, Android Studio with SDK/Platform Tools, and the editor/coding client. Authenticate GitHub. Authenticate Expo/EAS only if the actual workflow uses it; no tracked EAS build profile exists here.

Observed old-laptop baseline, not a claim about latest releases:

| Component | Observed version / requirement |
|---|---|
| Node / npm | **22.13.0 / 10.9.2**. Installed RN declares `^20.19.4 \|\| ^22.13.0 \|\| ^24.3.0 \|\| >=25.0.0`. Use a compatible runtime and preserve the lockfile. |
| Expo / React Native / React | **57.0.2 / 0.86.0 / 19.2.3**. |
| TypeScript | **6.0.3**. |
| VisionCamera / face detector | **5.1.0 / 2.0.2**; v4 camera examples are incompatible. |
| Worklets | `react-native-worklets` **0.10.0**, camera-worklets **5.1.0**. |
| Java | Android Studio JBR reported **OpenJDK 21.0.10**. Installed native plugins also declare Java toolchain requirements; follow generated Gradle diagnostics rather than changing Java blindly. |
| Android SDK | Platform **36**, Build Tools **36.0.0**, NDK **27.1.12297006**, CMake **3.22.1**, Platform Tools are installed. RN catalog lists minSdk 24 / target and compile SDK 36. These are observed baselines, not a fresh-build result. |
| Gradle | Generated wrapper currently points to **9.3.1**. Use the regenerated project wrapper; no separate system Gradle install is required. |

Keep the initial move separate from dependency upgrades. `npm ci` recreates the lockfile tree; do not install every package's latest version during migration.

### 6.2 Clone and restore local configuration

PowerShell, after creating `C:\dev` if needed:

```powershell
git clone --branch feature/ui-revamp-v2 https://github.com/Soham908/video-testimonial.git C:\dev\video-testimonial
Set-Location C:\dev\video-testimonial
git status --short --branch
git log -5 --oneline
node --version
npm --version
```

Copy the existing **frontend `.env.local`** separately into the repository root using your secure transfer method. Backend/dashboard environments belong to their own repositories. Do not commit them.

Frontend variables referenced by code:

| Variable | Meaning |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | Required API base URL without trailing slash. A phone cannot use the laptop's `localhost`. A changed LAN host needs reachable IP/hostname and actual backend port. |
| `EXPO_PUBLIC_ENABLE_SELF_REGISTRATION` | Only literal `true` enables tester registration UI/default entry. Backend `ENABLE_SELF_REGISTRATION` must agree. Copy the intended current value; absent means false. |
| `EXPO_PUBLIC_ENABLE_REEL_RENDERING` | Only literal `true` enables frontend reels. Backend `ENABLE_REEL_RENDERING` is independent. Default false; keep disabled until template/export paths are ready. |

The inspected `.env.local` contains API URL and self-registration flag; reel flag is absent there. No actual values are copied here. `EXPO_PUBLIC_*` is bundled into the app: service keys/server credentials must stay on the backend. Tooltips are a local `config.ts` constant, currently enabled.

Set Android paths to the **new** laptop's actual installations. Default Windows locations:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr'
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:Path = "$env:JAVA_HOME\bin;$env:ANDROID_HOME\platform-tools;$env:Path"
java -version
adb version
```

Assignments affect the current shell. Configure persistent Windows environment variables through system settings if desired. Accept SDK licenses/install missing components through Android Studio on that laptop.

### 6.3 Install, regenerate, and build

```powershell
npm ci
node node_modules/typescript/bin/tsc --noEmit --incremental false --pretty false
npx expo prebuild --platform android --no-install
adb devices
npm run android -- --device
```

Use a physical Android phone for camera/audio QA; enable USB debugging and approve the new laptop's fingerprint. Select the phone when prompted. `expo run:android` builds/installs a development build and can start Metro. For later JS-only sessions with that build installed:

```powershell
npx expo start --dev-client
```

This app requires a **native development build**, not Expo Go. Rebuild after native dependency, plugin, permission, or relevant app-config changes. Reload/restart the development session after JS/env changes; not every styling edit requires a native rebuild.

If Metro over Wi-Fi is the only issue, USB forwarding is an alternative:

```powershell
adb reverse tcp:8081 tcp:8081
npx expo start --dev-client --localhost
```

That forwards Metro only, not a separate API. If backend runs on the new laptop, bind it appropriately, verify actual port/firewall, and update the frontend URL. If deployed remotely, preserve that reachable deployment. API_CONTRACT's LAN instructions are historical, not proof of today's deployment.

### 6.4 Native details that must survive the move

- **Patch must apply during `npm ci`.** `postinstall` runs `patch-package`; preserve `patches/react-native-vision-camera-face-detector+2.0.2.patch`. It fixes unstable hook memoization that recreated the native detector every render and caused severe lag. Do not silently skip it with `--ignore-scripts`.
- Keep `react-native-worklets/plugin` last in Babel and `babel-preset-expo` explicitly installed.
- Keep `plugins/withBackgroundUploadService.js` registered in `app.json`. It declares Android `dataSync` type/type-specific permission and wake lock for upload keepalive.
- `android/` and `ios/` are ignored/generated. A new clone lacks them; regenerate from locked packages/config. Do not copy old `node_modules`, Gradle/CMake caches, or absolute autolinking paths.
- Current `android/gradle.properties` has **all four ABIs**: `armeabi-v7a,arm64-v8a,x86,x86_64`. DEV_NOTES' old two-ABI speed tweak is not the current setting. Dev-only restrictions should not accidentally reach release distribution; confirm support with the actual locked native dependencies.
- Avoid CMake/Ninja long-path failures with a short real checkout. Junctions, `subst`, and the long-path registry switch did not reliably resolve past failures.
- Required edits under ignored native folders will not travel through Git. Reproduce needed customizations in tracked config plugins before relying on them.

Generated Gradle release currently uses debug signing. This is a development baseline, not production signing setup. If an installed app requires a particular signing identity, preserve matching signing material securely before updating from the new laptop. A mismatch can lead to an uninstall suggestion; **do not uninstall/clear app data with unsent recordings you need**. Transfer production keystores/passwords/certificates and any custom debug key securely outside Git, as applicable.

For a Mac, use the same branch/lockfile/env. Local iOS builds additionally need Xcode and generated iOS/CocoaPods tooling; `npm run ios` is the repository entry point. No generated iOS project or successful iOS migration was verified here. Windows local Android is the documented baseline.

## 7. Data and context that Git does not transfer

| Item | Migration action |
|---|---|
| Frontend `.env.local` | Copy separately; check API URL against the new machine/network. |
| Backend/dashboard environments and accounts | Transfer in their projects; reauthenticate cloud/deployment services as needed. Never copy service secrets into mobile bundle variables. |
| Signing keys/certificates | Preserve applicable signing identity/store access separately. Ignore rules exclude several key formats/native folders. |
| Native projects/dependency caches | Reinstall/regenerate; they are not reproducible configuration sources. |
| `screenshots/`, local builds, ignored `assets/vo` | Copy reference/test assets still needed. Runtime VO comes from backend/cache, not a required tracked `assets/vo` bundle. Tracked icons/logo clone normally. |
| Agent/editor settings and chat history | Local `.claude/settings.local.json` is machine-specific and excluded from this commit. Reconfigure tools. Use docs/starter prompt below to restore context. |
| Phone's app data | Laptop cloning does not back it up or move it. Same phone/app can retain it; uninstalling, clearing storage, or switching phones does not preserve it through Git. |

Private runtime state includes `recordings/`, `session-state.json`, `questions-cache.json`, `my-videos-sync-cache.json`, `vo-cache/`, `vo-sync-cache.json`, `consent-state.json`, and `first-run-tips-seen.json`; auth/preferences also use SecureStore. No general state export/import facility is implemented. Audit account-isolation/recovery defects mean login/logout is not a safe backup strategy.

## 8. Unfinished work to carry forward

The [2026-10-01 audit](AUDIT_REPORT.md) reviewed the same implementation commit. **22 findings include four High findings**; no subsequent source fix is present. Its evidence/reproductions/limits remain useful. [AUDIT_FIX_PROMPTS.md](AUDIT_FIX_PROMPTS.md) has focused prompts for the four High issues.

First implementation work after the new laptop builds:

| Priority | Finding | Why it matters |
|---|---|---|
| 1 | F01: account isolation | A new signed-in distributor can inherit the previous person's local footage/upload state. Preserve rightful-owner data without cross-account exposure. |
| 2 | F04: startup persistence | Offline/unauthenticated startup can overwrite recording metadata with empty state. MP4s remain but app access is lost. Coordinate with F01 ownership. |
| 3 | F02: rehearsal isolation | Default auto-start/shared alignment callback can move rehearsal into real capture. |
| 4 | F03: recorder lifecycle | Rejected native start can leave the visible timer running without capture. |
| 5 | F05: stable question identity | Refresh/reorder can attach an old positional take to another question. |

Other work: take-selection/preview consistency, stale-media/partial-VO caches, offline My Videos, later-batch service ownership, atomic checkpoints, storage/bootstrap errors, valid trims/coordinates/actual duration, real noise readiness, and metering-file cleanup. Dependency advisory results are dated October 1: rerun when maintaining dependencies instead of assuming they stay current.

Known product/integration gaps:

- Complete VO before countdown; current five-second countdown + 300 ms buffer is tied to old VO lengths.
- Byte-offset resumable upload and receipt/checksum-backed retention remain unimplemented. Keepalive/per-question skipping are not byte-level resume.
- Full reviewed consent, test-credential removal, actual account provisioning, functioning settings/help actions remain release work.
- Before enabling reels: template quality, variable duration, rotation/crop, caption styling, remote save/Android file sharing need work.
- “Reels ready” Home, notifications/deep links, prompt customization, profile persistence, normalization, and final visual choices remain deferred/unresolved in DECISIONS.
- Reconcile provider/model/template orchestration against backend source; old planning prose is not deployed-service evidence.

## 9. Backend/dashboard handover still required

This document covers the frontend part. For each other repository, record URL, exact active branch/commit, setup/start commands, environment **names**, dependencies, and pending work. Do not put secret values in handover docs.

| Full-stack item | What the corresponding owner/session must establish |
|---|---|
| API and workers | Actual repo/branch; runtime/package manager; local/deployed locations; DB/queue; migration/seed procedures; auth/current contract; start/stop/log commands. Not present here. |
| Database/queued work | Whether remote or on old laptop; backup/restore or connection plan; distributor/client/question data; pending job handling. Copying `.env` does not copy data. |
| Object storage/VO | Actual S3/R2 account/buckets/permissions; question VO, source videos, branding, outputs, lifecycle rules. Git/DB dumps do not contain all objects automatically. |
| Rendering | Where nexrender/After Effects runs; `.aep` templates/assets/fonts/plugins, configuration/licensing, watched folders. No AE project or production media is tracked here. |
| Dashboard | Actual repo/branch/build/start commands; API URL, login/roles, response shapes, pending UI. No dashboard code was available here. |
| Deployment/access | Hosts, DNS/TLS/proxy/process config, SSH/cloud/GitHub access, backups/logs as applicable. Preserve remote services if only the developer laptop is moving. |

Identify services running on the old laptop before retiring it. Remote services mainly need working access from the new laptop; local API/DB/render processes need a separate move/startup plan. This handover does not imply they have been transferred or backed up.

## 10. Acceptance checks on the new laptop

1. Confirm branch/handover commit, ignored `.env.local`, successful `npm ci`, applied face-detector patch.
2. Type-check without emit. Build/install a native dev client on physical Android and connect Metro.
3. With a controlled test account, check API/profile/version gate, questions, English/Hindi/Marathi. Empty reels with rendering off is expected.
4. Check camera/mic prompts, preview/alignment, short capture, review/trim, kept takes, playback; record device model/actual format.
5. Use designated test media/accounts to check confirmed upload → PUT → confirm → server segment. Upload changes backend data; avoid real distributor footage/accidental production submission during setup.
6. Backend/dashboard handovers then verify the same client/distributor/question mapping and expected processing/output. Disabled rendering is not a broken laptop build.
7. Separate known audit failures from migration regressions. Reproduce account-switch/offline-restart failures on disposable state; protect valuable unsent recordings first.

Preparation checks on **2026-10-26**: current branch was fetched and matched remote before doc edits; runtime/config/history were inspected. TypeScript with no emit passed without diagnostics. All 50 local Markdown links across the six handover/audit/instruction documents resolved, code fences were balanced, and the inspected credential literals/private API URL were absent from those documents. Git whitespace validation passed. No clean install/prebuild/native build, new-laptop test, production API request, database migration, or deployment is claimed by this documentation handover.

## 11. Starter message for a new coding-agent session

Paste after opening the cloned repository:

```text
Continue the AI-guided video testimonial mobile frontend in this checkout.
Read HANDOFF.md, AGENTS.md, DECISIONS.md, DEV_NOTES.md, API_CONTRACT.md, and
AUDIT_REPORT.md before implementation. AUDIT_FIX_PROMPTS.md contains focused
High-priority fixes. Check git status/log first; later commits may differ.

The handover branch was feature/ui-revamp-v2. Expo57 / RN0.86 / VisionCamera5.1,
required face-detector patch, Android upload-service config plugin. Native dev
client, not Expo Go. Questions are backend-configured; language picker exists;
keep up to two local takes and upload one primary per question only after
confirmation. Reels default off. Audit findings are unresolved, not fixes landed.

Soham decides/reviews/device-QAs; you implement. Preserve product decisions and
working native behavior. Establish what runs locally versus remotely. Get
backend/dashboard context from their own repos. Never print/commit environment
values or signing keys. First confirm migrated environment type-checks/builds,
then help with the next scoped task.
```
