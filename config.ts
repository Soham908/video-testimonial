// Feature flags for this build - env-driven, same pattern as
// EXPO_PUBLIC_API_BASE_URL in api.ts (Expo's babel preset inlines
// EXPO_PUBLIC_* vars at build time, no extra dependency needed).

// The branded-reel template isn't ready yet (CLAUDE.md) - default off so
// internal testing isn't blocked on a render step that was never going to
// produce a usable result. Flip EXPO_PUBLIC_ENABLE_REEL_RENDERING to
// 'true' once the template is ready. The backend has its own independent
// ENABLE_REEL_RENDERING env var (src/config/env.ts in the backend repo) -
// keep both in sync, since this one only stops the client from asking for
// rendered reels, it doesn't stop the server from making them.
export const ENABLE_REEL_RENDERING = process.env.EXPO_PUBLIC_ENABLE_REEL_RENDERING === 'true';

// Self-registration for internal test participants (API_CONTRACT.md's
// POST /register) - an alternative to the 5 seeded accounts, gated the same
// two-independent-flags way as ENABLE_REEL_RENDERING above. The backend's
// own ENABLE_SELF_REGISTRATION (src/config/env.ts in the backend repo)
// actually gates whether the route exists at all; this one only controls
// whether the app shows the "New distributor? Register" entry point on
// Login - keep both in sync, since flipping only this one would show a
// dead-end button, and flipping only the backend one would leave the real
// endpoint reachable with no in-app way to find it.
export const ENABLE_SELF_REGISTRATION = process.env.EXPO_PUBLIC_ENABLE_SELF_REGISTRATION === 'true';
