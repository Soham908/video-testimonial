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
