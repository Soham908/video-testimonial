import { apiGet } from './api';

// GET /distributors/me (API_CONTRACT.md). `name`/`phone` are real,
// always-populated columns. `business`/`city`/`years_as_distributor` are
// internal-test-phase-only - hand-seeded, `null` until a real provisioning
// flow exists - and deliberately not consumed by the app yet (only name/
// phone are wired into the header/profile screens so far).
//
// `min_app_version` piggybacks on this same per-launch call rather than a
// dedicated endpoint - it's really a global app-config value, not
// distributor-specific, but every distributor gets the same value back and
// this call already fires once on every launch (see AppFlow.tsx), so a
// separate round-trip would cost more than the semantic mismatch is worth.
// Backend-optional: defaults to "0.0.0" server-side if its env var is
// unset, so this is always a real string, never missing/null.
export interface DistributorProfile {
  id: string;
  name: string;
  phone: string;
  business: string | null;
  city: string | null;
  years_as_distributor: number | null;
  min_app_version: string;
}

export async function fetchDistributorProfile(): Promise<DistributorProfile> {
  const { distributor } = await apiGet<{ distributor: DistributorProfile }>('/distributors/me');
  return distributor;
}
