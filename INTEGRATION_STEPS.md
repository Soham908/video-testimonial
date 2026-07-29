# Frontend ↔ backend integration — build steps

Companion to `API_CONTRACT.md` (the source of truth for request/response
shapes) and the backend's own `BUILD_STEPS.md` in its separate repo — this
file tracks only the frontend-side sequencing. Same process as the backend
side: goals run in order, each one finished and verified before the next
starts, nothing half-wired.

Base URL comes from `.env.local` → `EXPO_PUBLIC_API_BASE_URL` (currently
`http://192.168.1.116:3000` — the backend machine's LAN IP as of 2026-07-27;
same-wifi test phase per `API_CONTRACT.md`, will change to a real deployed
URL later with no shape changes).

Decisions this plan assumes (see memory: backend-integration-decisions,
auth-integration-plan for full rationale):
- Backend status detail (`transcribing`, `rendering`, etc.) stays internal;
  the user only ever sees a collapsed state (processing / ready / failed).
- Plain single-shot `fetch` PUT for the video upload for now — resumable
  upload is a known, deliberately deferred follow-up, not forgotten.
- Checksum verification on upload deferred — fine while Soham is the only
  tester.
- Local-first caching for My Videos: bare-minimum version only.
- Auth: a real (visible) login screen, prefilled with a test account,
  making a real `POST /login` call — not mocked.

## Goal 1 — API foundation
- `api.ts`: base URL from env, JSON fetch wrapper, normalizes the
  contract's `{ error, message? }` error shape into thrown JS errors the
  rest of the app can catch uniformly.
- No UI changes. No dependency additions.
- Verified indirectly by Goal 2 (first real call is `/login`).

## Goal 2 — Auth
- Add `expo-secure-store` dependency.
- `screens/LoginScreen.tsx`, styled to match existing screens, prefilled
  with the `kumar` / `kumar123` test account.
- `AppFlow.tsx`: new `login` screen state gating entry to the rest of the
  app.
- On launch: if a token is already stored, validate it against `GET /me`
  silently and skip straight past the login screen if still valid;
  otherwise show the login screen.
- Real `POST /login` call, JWT stored via secure-store, attached as
  `Authorization: Bearer <token>` by `api.ts` on every call after.

## Goal 3 — Upload wiring
- Replace the current mock `Uploading → SkipLink → Confirmation` transition
  with the real sequence: `POST /segments/upload-url` → `PUT` video bytes
  to the returned `upload_url` → `POST /segments/confirm`.
- Convert `questionIndex` (0-based internally) to the contract's 1-based
  `question_index` at this boundary only.
- Handle the documented failure cases: `400`s surfaced as a retry-safe
  error, `404 video_not_found` treated as safe-to-retry-from-PUT.

## Goal 4 — My Videos read wiring
- `GET /distributors/me/segments` and `GET /distributors/me/rendered-videos`
  wired into `MyVideosScreen`.
- Map raw backend `status` values to a small user-facing set (processing /
  ready / failed) — never show raw backend status strings to the end user.
- Basic local-first cache: a small JSON file (via `expo-file-system`,
  already a dependency) storing last-synced `updated_at` per
  `question_index`; match → play local file, mismatch/missing → use
  `playback_url`.

## Goal 5 — End-to-end pass
- Full manual run on-device: login → record → upload → confirm → see it in
  My Videos → see render status update.
- Fix whatever real-device testing surfaces before calling this done.

---
Status: done. Full loop verified on-device (login → record → upload →
confirm → transcribe/caption → nexrender render → My Videos shows both the
raw answers and the rendered branded videos correctly). One fix made along
the way: `upload.ts`'s video PUT was switched from `fetch(uri).blob()` to
`expo-file-system`'s native `File.upload()` after the former OOM-crashed on
a real recorded video by buffering the whole file into memory.

Known follow-ups, not yet scheduled:
- Retake doesn't re-upload its replacement video (see memory:
  backend-integration-decisions).
- Upload is still auto-triggered on session completion, not user-initiated
  via an explicit button (planned rework, see same memory file).
- Byte-offset resumable upload, checksum verification on confirm, and
  fuller local-first caching are all deliberately deferred.
