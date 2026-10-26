# AI-guided video testimonial app

React Native mobile app for distributors to record individual testimonial answers with on-device framing guidance, review takes, and explicitly upload selected videos for server-side processing.

**Moving to another laptop or starting a new coding session? Read [HANDOFF.md](HANDOFF.md) first.** It contains the current branch, product context, Windows/native setup, environment-variable names, code map, unresolved work, and the remaining backend/dashboard handover checklist.

## Repository context

- Active working branch at handover: `feature/ui-revamp-v2`.
- Mobile frontend only; backend and dashboard have separate repositories/workflows.
- Expo 57 / React Native 0.86 / VisionCamera 5.1. A native development build is required; Expo Go is insufficient.
- Install the locked dependencies with `npm ci`; preserve the `patch-package` postinstall step.
- Copy `.env.local` separately. Keep secrets and signing material outside Git.
- The October audit findings remain unresolved in the handover implementation snapshot.

## Read next

| Document | Purpose |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Start here: laptop migration and current implementation context. |
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | Coding-agent instructions and original architecture intent. |
| [DECISIONS.md](DECISIONS.md) | Product choices, deferred decisions, rejected approaches. |
| [DEV_NOTES.md](DEV_NOTES.md) | Build/performance investigations and recurring gotchas. |
| [API_CONTRACT.md](API_CONTRACT.md) | Copied mobile API contract; verify against backend source when integrating. |
| [AUDIT_REPORT.md](AUDIT_REPORT.md) | 2026-10-01 security/reliability findings, evidence, and limitations. |
| [AUDIT_FIX_PROMPTS.md](AUDIT_FIX_PROMPTS.md) | Focused implementation prompts for the four High findings. |

Some older docs describe planned behavior rather than implemented features. The handover identifies the important differences; current code and the relevant product decision should be checked together.
