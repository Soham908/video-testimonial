# DECISIONS

Single source of truth for product and design decisions on the testimonial app.

**How to use this file:** when something is decided, move it from OPEN to
LOCKED with a one-line reason. When something is ruled out, move it to
REJECTED with the reason — rejections matter as much as decisions, because
they stop the same idea being re-litigated three sessions later.

Keep reasons short. The reason is the point; without it a decision is just
a preference nobody can evaluate later.

Last updated: 2026-09-09

---

## LOCKED

### Product shape

| Decision | Reason |
|---|---|
| One question per session, not one continuous flow | Continuous flow is all-or-nothing — dropping out at Q2 yields nothing usable. Per-question is resumable by construction. |
| 5 questions for the first client | Scoped to first client; larger enterprise clients may use more. |
| Every question produces a branded reel (this version) | The reel is the distributor's only incentive. Split into feedback-only questions is deferred, not rejected. |
| English, Hindi, Marathi — local-only language picker | Backend has no write-back for `language_pref` yet, only a per-call `?language=` override; picker + VO re-fetch/re-cache on switch shipped (`ProfileScreen.tsx`, `voCache.ts` keyed by question+language). Superseded the original "English only for now." |
| Uploads are manual and batched — nothing sent until the user submits | User (and boss) decision. Massively reduces orphaned-upload risk vs. auto-upload, and matches the one-question-at-a-time model. |
| Per-question reels, not one merged video | Simplifies render triggering; eliminates stale-render-after-retake. |
| Takes: enabled, capped at 3, oldest replaced | Retakes matter for quality; a cap keeps My Videos scannable and storage bounded. |
| Rehearsals are never saved as takes | If it might be kept, people perform instead of practicing — and "nothing is saved" has to be literally true or trust breaks. |
| Quality over smoothness | Users record once. A slightly rigid flow that produces good video beats a smooth one that produces unusable video. |

### Navigation & structure

| Decision | Reason |
|---|---|
| Tab bar: Home / My Videos / Help / Profile | Four tabs, each earns its place. |
| Help is one page, not two | Two separate pages (tips + help) fragmented the same content. |
| Home does not show the user's own reels as primary content | Home's job is prompting the next action. Their content lives in My Videos. Exception: a "your reel is ready" banner. |
| Other distributors' real reels removed everywhere | Consent problem — real submissions shown to other distributors. Replaced with company-produced samples + a stat line, which serve the same reference/social-proof function. |
| Permissions requested after starting question 1, not during onboarding | Asked in context, when the reason is obvious. |
| Permissions detected, not shown once | Must handle the denied case where the OS won't re-prompt. |
| My Videos flips post-render: reels on top, questions below | Once rendered, reels are what users return for; questions become historical but stay accessible. |

### Recording experience

| Decision | Reason |
|---|---|
| Camera check is a separate screen from recording | Different job — do not merge. |
| Checks revealed one at a time, executed in parallel | Sequential reveal aids comprehension; sequential *execution* would be pointless waiting, five times over. |
| Auto-start countdown does not cancel once started | A countdown that yanks itself back feels broken in the hand, however rigorous it looks in a spec. |
| "Skip anyway" present, styled quietly | Genuine cases exist (ambient home noise can read as natural). It's an escape hatch, not an equal option. |
| On-screen prompts: 2–3 words, 3 shown at once, equal weight | Must be glanceable without breaking eye contact with the camera. |
| No tap-to-advance on prompts, ever | Reaching for the phone mid-answer ruins the take. |
| Soft nudge at ~45s that length is good | Gentle wrap-up cue, never alarming. |
| Rehearse mirrors the real recording screen | Genuine practice, not a different screen. Full-sentence prompts here; passive (non-gating) quality indicators so users learn what they mean at zero stakes. |
| Remove-last-2-seconds is a toggle, not two buttons | Saves vertical space so the video gets more; state is self-evident. |
| Trim is a plain timeline — no frame thumbnails, no waveform | Both need native video/audio decode. `ffmpeg-kit-react-native` is retired; not worth a forked dependency for start/end trim on a sub-60s clip. |
| No edit option on the finished reel | The company controls the final branded output, not the distributor. |
| Finished reel: WhatsApp-first share + save to phone | WhatsApp is the distribution channel that matters here. |

### Approved layouts

Home 1C · Question brief 2D (reordered) · Camera check 3.1 · Recording 3D ·
Review & trim 4C · Finished reel 5A · My Videos 6C + 6E · Upload flow 7 ·
Help 8D · Profile 9C · Onboarding 14B

### Technical / build order

| Decision | Reason |
|---|---|
| Rebuild screens, not the app | ML Kit face detection, brightness, headroom, ambient noise, and vision-camera capture are already working on a physical device. Navigation and layout are what's being replaced. |
| Audit what survives before building | Otherwise working code gets regenerated. |
| Theme/token file before any screen | HTML→RN transfers tokens and structure, not code. Without a token file, thirty screens end up with hardcoded values and no path to theming. |
| All screens built on mock data first, wired to the API second | Isolates UI bugs from integration bugs — same reasoning as fixing template bugs before integration. |
| Backend batch-confirm work can start now | Doesn't depend on final screen design. |
| Question config narrowed to 1–5 | Matches the active question set on both sides. |
| Frontend built before backend changes are wired | Holding it on a real device will generate changes that no design file surfaces. |

---

## OPEN

### Needs a decision before it can be built

- **Home "reels ready" state (screen 18)** — deliberately deferred. Needs
  thinking, not more generated options.
- **Question set restructuring: 7 questions total, 3 → branded reel, 4 →
  survey/testimonial-only (feedback, no reel)** — new direction (2026-08-11),
  not yet implemented. Unresolved sub-question, needs boss clarification:
  do the 3 reel-eligible questions each become their own reel (Soham's
  assumption — 3 separate reels), or do all 3 get combined into a single
  reel (boss's stated preference)? Soham disagrees with the combined
  approach but hasn't raised it yet. Not to be built until this is resolved.
- **Reduced quality gate for feedback-only questions** — no branded output means
  the camera check, trim, and takes could be lighter. The split above is now
  roughly known (4 of 7 are feedback-only), but still open — not decided.
- **Final accent colour** — swatch options generated, not chosen.

### Known issues, fix pending

- **Dynamic composition duration** — template answer segment is fixed at ~30s;
  a ~58s answer gets silently truncated. Approach already worked out from prior
  testing. Actively destroying content today.
- **Crop / zoom on rendered output** — check the rotation-flag theory first
  (`ffprobe` for a rotate tag on a real recorded file) before assuming it's a
  template-fit problem.
- **Branded template quality** — current template is a placeholder. This is what
  the demo and the pitch actually rest on.
- **Caption font size and vertical position** — known fix, ffmpeg `force_style`.
- **Gemini → Claude for sentiment** — Gemini was an explicit testing-phase
  substitution, not a decision. Check the thinking-token budget while in there
  (5–7× cost swing on a task that needs no reasoning).
- **`backend-plan.html` has drifted** — Gemini vs. documented Claude,
  `render_segment` vs. `render_distributor` naming.

### Deferred — real, but not yet

- **Profile edit persistence** — editing name/business/years currently only
  updates local mock state, nothing is saved to a backend. Not a priority;
  later.
- **Cross-device video normalization** — no normalization happens today.
  Different capture devices (e.g. Samsung Note 10 vs. an iPhone) will
  produce technically different output (resolution/bitrate/codec/etc.)
  even where the visible difference is small. Needs research before
  deciding an approach.
- **Research: how apps like WhatsApp do lightweight video compression +
  scrub-thumbnail trim UI without heavy system load** — relevant to both
  pre-upload compression and to revisiting this doc's own "no frame
  thumbnails on the trim timeline" rejection below (rejected specifically
  because native decode was assumed too costly — worth confirming that
  assumption still holds before treating it as settled).
- **Add your own prompts** — entry point designed, input flow deliberately not.
- **Background upload survival** (iOS URLSession background / Android
  WorkManager) — unverified whether the app supports it. Changes whether
  "delayed confirm works fine" is actually true.
- **Recording quality / bitrate reduction** — ~100MB per minute is high.
- **S3 orphaned-upload backstop** — scale concern, not a correctness one.
- **nexrender webhook vs. polling** — polling is fine until concurrent renders
  exceed worker capacity.
- **Insights exposure + admin dashboard** — one gap, not two. Insights have
  nowhere to go without the dashboard; the dashboard has nothing to show
  without exposed insights.
- **`brand_themes` table** — cheaper to add before theming spreads across RN,
  ffmpeg, AE, and reports.

---

## REJECTED

| Rejected | Reason |
|---|---|
| Single continuous flow, all questions in one session | All-or-nothing dropout; forced repeated approach/retreat from the phone; no chance to review before committing. |
| Automatic upload | User can't control what's sent; app-close mid-upload is unrecoverable and invisible. |
| "Next point" button while recording | Requires reaching for the phone mid-answer. |
| Full-sentence prompts while recording | Not readable at a glance while speaking. |
| Waiting/processing screen showing backend steps | Not the distributor's concern; backend queue position isn't meaningful to them. Replaced by release-and-notify. |
| Frame thumbnails on the trim timeline | Needs native video decode; retired dependency. |
| Waveform on the trim timeline | Same — needs audio decode. |
| Saving a rehearsal as a take | Breaks the psychological safety that makes rehearsal useful; makes "nothing is saved" untrue. |
| Change-take control on the upload confirm screen | Duplicates review-screen logic at a commitment moment. Row is tappable back to review instead. |
| Other distributors' real reels on Home | Consent exposure. |
| Edit option on the finished reel | Company controls final output. |
| Hindi-first UI (for now) | English variant read cleaner and matches the pitch audience. |
| Onboarding variant 14A (single screen) | 14B's 3-step swipe carries one idea per step. |

---

## PROCESS NOTES

Learnings about *how* to work on this, kept because they were expensive to
learn:

- **Visual beats prose for design decisions.** A rendered screen forces choices
  that prose lets you defer. Text can stay vague about what happens after the
  tap; a screen can't.
- **Decide before generating.** Generating options for something undecided
  produces sprawl, not clarity.
- **One decision at a time, recorded immediately.** The overwhelm came from
  liking parts of many screens with no record of what was settled.
- **Variants side by side, never stacked.** Compare per-screen, not per-flow —
  two frames wide fits, ten doesn't.
- **Export a PNG after every round**, before prompting the next one.
- **Source of truth beats reconstruction.** Contracts and reference docs should
  be generated by reading actual source files, not rebuilt from memory.
- **Narrow scoped prompts with review checkpoints** beat open-ended autonomous
  runs.



## Extra information for frontend part
Entry

Splash
WhatsApp invite link → app open
Identity confirmation (name/business/city shown back, correctable)
Onboarding, 3-step swipe
Login screen (logged-out return)
Permissions: explainer state, denied state, detection on each entry to recording

Home — five distinct states

First time, nothing recorded
In progress
All recorded, nothing submitted — plus the additional-questions box at the bottom
Submitted, reels being prepared
Reels ready (still open)
Shared elements: next-question card, how-to videos (2 + see all), company sample videos carousel, stat line, "reel ready" banner

Question brief

Question + talking points
"Read this to me" audio playback
Sample answer video
"Before you start" checklist
"Nervous on camera?" dropdown
"Add your own prompts" entry point (placeholder only, no input flow)
Two buttons: start recording, rehearse

Camera check

Face outline guide
Four parameters: framing, distance, sound, light — brightness detection not built yet
Guidance line below outline (only place instruction text appears)
Sequential reveal, parallel execution
Auto-start toggle → all pass → 3s countdown → recording; no cancel once started
"Skip anyway", quiet styling

Recording

Timer
3 prompts, 2–3 words, equal weight, left-aligned, auto-advance
Question text visible
~45s "good length" nudge
"I'm done answering" button
Progress indicator during take

Rehearse

Mirrors recording screen
Full-sentence prompts
Passive quality indicators, non-gating
Persistent "not being saved" signalling
"Finish practicing" → pop-up: record for real / back to brief

Review & trim

Playback
Remove-last-2-seconds toggle + reason line
Takes carousel (only if >1, max 3, oldest replaced, selected marked)
Plain trim timeline, start/end handles, time labels
Keep this take / record another
Post-keep prompt: next question / my videos / home

My Videos

Pre-upload: per-question rows (not recorded / recorded / uploaded), watch control, "using take 1 of 3", change action, record button on unrecorded rows
Upload button top-right, subtitle copy
Branded reels section: empty state and populated
Post-render: reels on top, questions below
"Upload again" state after failure
Tab notification dot

Upload flow

Selection: all questions, take shown per question, rows tappable back to review
Confirmation pop-up
Released state: keep internet on, don't close app, back to home
Progress bar on submit button
Upload failed: try again / send later

Finished reel

Congratulations + which reel
Large video
WhatsApp share, save to phone
No edit option

Help

Quick tips as chips → informative pop-up with video
How-to videos: 6 total, 2 shown + see all
Talk to someone card → pop-up (WhatsApp, call back, support hours)
Sample videos carousel
FAQs

Profile

Avatar, name, business
Reel name card + explainer copy + edit pop-up
"Distributor for X · Y years" in account section
Settings, v1.0

Cross-cutting

Theme/token file first
Notification handling → deep link into app
Return-to-app state routing (where users land depends on progress)
Local-first cache with updated_at comparison
Keep existing: ML Kit face detection, headroom, ambient noise, vision-camera capture
