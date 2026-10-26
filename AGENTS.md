# Project context — AI-guided video testimonial app

## Laptop handover / current implementation

Read [HANDOFF.md](HANDOFF.md) before continuing work on a migrated checkout. It
records the 2026-10-26 handover, active branch, native setup, current features,
documentation drift, and unresolved audit findings. The architecture below
includes intended v1 behavior; use the handover and current code to distinguish
what is already implemented from what is still required. See
[AUDIT_REPORT.md](AUDIT_REPORT.md) and [AUDIT_FIX_PROMPTS.md](AUDIT_FIX_PROMPTS.md)
for the carried-forward audit and scoped High-priority fix prompts.

## What this is
An app that guides distributors (large Indian distributor/franchise networks — IFB, Aditya Birla scale) through recording their own testimonial videos, using on-device computer vision for real-time framing/lighting coaching instead of a professional shoot. Videos get auto-processed into branded reels, plus a transcription-driven analytics layer (sentiment, themes, aggregated insights) for the client.

Differentiator vs. VideoAsk / Vocal Video / Seenit: real-time, on-device CV framing coaching. None of them offer this.

Solo build. Soham has no dedicated engineering colleague — Codex does the implementation, Soham reviews/QAs. Prior experience: nexrender + After Effects templated rendering at scale (~100K videos).

## Locked v1 architecture decisions

**Recording flow**: Segment-wise — one file per question, 5 questions total. (Continuous single-take was considered and rejected — segment-wise makes retakes trivial and avoids timestamp-splitting logic in the render pipeline.)

**Question → record sequence**: TTS question plays fully → 5-second visual countdown → recording auto-starts. No simultaneous playback+record. Reasoning: clean simultaneous audio needs acoustic echo cancellation (AEC), which isn't universally available/reliable on the budget/mid-range Android hardware common in this market, and camera-recording APIs (unlike VoIP frameworks) don't include AEC by default. The 5-second countdown costs nothing in final video length — recording hasn't started yet, so there's nothing to trim.

**Camera guidance (v1, on-device only)**:
- Alignment/centering + distance: face landmarks (MediaPipe / ML Kit via `react-native-vision-camera` frame processors)
- Backlighting: face-region brightness vs. background brightness comparison (inverse reading of the same check also flags "light source behind the person")
- Headroom / eye-line framing: extension of the same landmark data
- Orientation: device sensors
- Shake: accelerometer
- Ambient noise: mic amplitude sampling before recording starts (not full audio analysis)
- Background complexity (clutter proxy, not semantic understanding): Selfie Segmentation isolates the background region, then edge-density/variance gives a "busy vs. plain" signal
- Explicitly out of scope for v1: true semantic scene understanding (e.g. recognizing specific clutter, competitor branding) — would require a cloud vision call or custom-trained classifier, breaking the offline-first design. Tracked for v2.

**Guide overlay UI behavior**: Full alignment guide shown only during setup/lock phase. Fades out (smooth transition, not a hard cut) as recording begins — clean feed during the actual answer. Frame processor keeps running silently during recording; if alignment breaks badly mid-answer, flag that segment for a post-answer "redo this one?" prompt rather than interrupting live.

**Re-lock behavior across the 5 questions**: Full alignment lock (~15–20 consecutive good frames) required before question 1. Lighter recheck (~5–8 frames) before questions 2–5, since the person is already positioned.

**On-screen layout during recording**: Full-bleed camera feed. Top-left: recording indicator (dot + timer). Top-right: progress ("Question 2 of 5"). Bottom: dark bar with the question text — needs a hard character cap since it sits in a fixed-height bar over the video.

**Transcription**: Batch, server-side, after upload — not live STT. Candidates: Google Cloud STT (Chirp) or Whisper large-v3. Unresolved risk to test early: Hinglish code-switching and regional Indian languages/accents — don't assume either handles this cleanly out of the box.

## Storage & upload
- `react-native-vision-camera` writes recordings to the app's own sandbox storage — **no gallery/MediaLibrary permission needed**, only camera + microphone.
- Upload via presigned URL direct to object storage (Cloudflare R2) — not routed through the API server.
- Must be background + resumable given patchy tier-2/3 network conditions — `react-native-background-upload` or a `tus`-based resumable client (byte-offset resume, not restart-on-failure).
- Local copy retained until backend confirms receipt (checksum match), then deleted.

## Server-side processing chain
Two parallel, independent paths off the same uploaded file — neither blocks the other:
1. **Analytics path**: audio extraction (ffmpeg) → STT (Chirp/Whisper) → transcript stored → Codex API for sentiment + theme extraction → aggregated insights report
2. **Video path**: original + branding assets → nexrender + After Effects render queue → branded reel output

## Tech stack
React Native (Expo bare/dev-client workflow, not Expo Go) · `react-native-vision-camera` · MediaPipe / ML Kit frame processor plugins · ElevenLabs (TTS) · Chirp or Whisper (STT) · Codex API, Sonnet tier (sentiment/theme analysis) · nexrender + After Effects (rendering) · Cloudflare R2 (storage) · resumable background upload

## Explicitly deferred to v2
- Continuous single-take recording
- Real-time/live transcription and live on-screen captions
- LLM-driven dynamic follow-up questions during the interview
- Cloud vision API / custom ML for camera guidance and background understanding

## Open items not yet resolved
- Confirm nexrender template setup works with 5 discrete per-question clips (this is the current assumption/direction, not yet verified against the actual template)
- Final character cap for question script text (constrained by the bottom-bar UI)
- Consent screen modeled on HeyGen's approach — mandatory gate before any recording, compliance-reviewed

## Working style
- Soham reviews/QAs; Codex does heavy implementation lifting
- When asked to "decide" or "make the call," give one clear recommendation with rationale — not a menu of options
- v1 bias: simplest engineering decision that doesn't block a real requirement; complexity deferred to v2 unless it solves a v1 blocker
