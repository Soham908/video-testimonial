import { apiGet } from './api';

// GET /distributors/me (API_CONTRACT.md). `name`/`phone` are real,
// always-populated columns. `business`/`city`/`years_as_distributor` are
// internal-test-phase-only - hand-seeded, `null` until a real provisioning
// flow exists - and deliberately not consumed by the app yet (only name/
// phone are wired into the header/profile screens so far).
export interface DistributorProfile {
  id: string;
  name: string;
  phone: string;
  business: string | null;
  city: string | null;
  years_as_distributor: number | null;
}

export async function fetchDistributorProfile(): Promise<DistributorProfile> {
  const { distributor } = await apiGet<{ distributor: DistributorProfile }>('/distributors/me');
  return distributor;
}
