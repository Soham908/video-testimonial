import type { PhoneCountryCode } from './phoneNumbers';
import * as SecureStore from 'expo-secure-store';
import { ApiError, apiGet, apiPost, apiGetWithToken, apiPostWithToken, setAuthToken, captureAuthSession, authSessionIsCurrent, type AuthSession } from './api';

const TOKEN_KEY = 'auth_token';
let credentialWrites: Promise<unknown> = Promise.resolve();
function credentialWrite<T>(operation: () => Promise<T>): Promise<T> {
  const next = credentialWrites.then(operation, operation);
  credentialWrites = next.catch(() => {});
  return next;
}
async function storeToken(token: string, expected: AuthSession): Promise<void> {
  await credentialWrite(async () => {
    if (!authSessionIsCurrent(expected)) throw new Error('The signed-in account changed. Please try again.');
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    if (!authSessionIsCurrent(expected)) throw new Error('The signed-in account changed. Please try again.');
    setAuthToken(token);
  });
}
export async function storedAuthToken(): Promise<string | null> {
  await credentialWrites;
  return SecureStore.getItemAsync(TOKEN_KEY);
}
// The comparison runs inside the same queue as login writes: A's delayed
// cleanup cannot erase B's token, even when native SecureStore is slow.
export async function logoutIfSession(expected: AuthSession): Promise<AuthSession | null> {
  return credentialWrite(async () => {
    if (!authSessionIsCurrent(expected)) return null;
    setAuthToken(null);
    const cleared = captureAuthSession();
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return cleared;
  });
}

interface LoginResponse {
  token: string;
}

interface MeResponse {
  auth: { distributor_id: string; client_id: string };
}

// What GET /me actually returns today - just the auth-scoped ids from the
// JWT, not a display name/phone/etc. (those aren't in the token and there's
// no endpoint that returns them yet - see ProfileScreen.tsx for what that
// blocks). `distributorId` is the one real, already-available piece of
// distributor identity the app can honestly show anywhere.
export interface CurrentAuth {
  distributorId: string;
  clientId: string;
}

export async function login(username: string, password: string): Promise<void> {
  const expected = captureAuthSession();
  const { token } = await apiPost<LoginResponse>('/login', { username, password });
  await storeToken(token, expected);
}

// POST /register (API_CONTRACT.md) - self-registration for internal test
// participants, gated behind ENABLE_SELF_REGISTRATION on both ends (see
// config.ts). Same response shape as login() - a token, usable immediately
// - so callers can treat a successful registration exactly like a
// successful login from this point on. `phone` and `password` are both
// required now (phone is the identifier loginByPhone() logs back in with) -
// send the selected country and national digits. The backend validates and
// preserves country identity; Indian accounts keep their legacy identifiers.
// A 409 (phone already registered) comes back as an ApiError with
// code === 'phone_already_registered' - callers should catch that
// specifically and route to sign-in rather than showing it as a generic
// error (API_CONTRACT.md).
export async function register(name: string, phone: string, password: string, organizationInvite?: string, country: PhoneCountryCode = 'IN'): Promise<void> {
  const expected = captureAuthSession();
  const { token } = await apiPost<LoginResponse>('/register', { name, phone, password, country_code: country, ...(organizationInvite ? { organization_invite: organizationInvite } : {}) });
  await storeToken(token, expected);
}

// POST /login/phone (API_CONTRACT.md) - login counterpart to register(),
// for distributors who signed up that way. Same gating (ENABLE_SELF_
// REGISTRATION) and same response shape as login()/register(). Wrong
// password and unknown phone both come back as the same generic 401
// message - don't build UI copy that assumes which one happened.
export async function loginByPhone(phone: string, password: string, country: PhoneCountryCode = 'IN'): Promise<void> {
  const expected = captureAuthSession();
  const { token } = await apiPost<LoginResponse>('/login/phone', { phone, password, country_code: country });
  await storeToken(token, expected);
}

// Restricted recovery checks identity before committing anything to the active
// session. A correct password for another account cannot resolve this intent.
export async function authenticateDeletionOwner(owner: string, phone: string, password: string, country: PhoneCountryCode): Promise<{token: string; auth: CurrentAuth}> {
  const { token } = await apiPostWithToken<LoginResponse>('/login/phone', { phone, password, country_code: country }, null);
  const { auth } = await apiGetWithToken<MeResponse>('/me', token);
  if (auth.distributor_id !== owner) throw new Error('Sign in to the account whose deletion is being checked. No account or recordings were changed.');
  return { token, auth: { distributorId: auth.distributor_id, clientId: auth.client_id } };
}
export async function adoptRecoveredAuth(token: string, expected: AuthSession): Promise<void> { await storeToken(token, expected); }

// Confirms the current token against the backend and returns the ids it's
// scoped to, or null if there's no token / it's no longer valid. Used both
// by restoreSession() below and right after a fresh login (login() itself
// doesn't call /me, so callers that need distributorId right away call this
// once login() resolves).
export async function getCurrentAuth(): Promise<CurrentAuth | null> {
  try {
    const { auth } = await apiGet<MeResponse>('/me');
    return { distributorId: auth.distributor_id, clientId: auth.client_id };
  } catch (error) {
    if (error instanceof ApiError && ['token_expired', 'invalid_token', 'missing_token', 'account_deleted'].includes(error.code)) return null;
    // Network/server/storage failures must preserve credentials and owned work.
    throw error;
  }
}

// Called once on app launch. A stored token merely being present doesn't
// mean it's still valid (could be revoked backend-side before its 30-day
// expiry) - GET /me is the documented "is my token working" check, so use
// it here rather than trusting storage alone.
export async function restoreSession(): Promise<CurrentAuth | null> {
  const beforeRead = captureAuthSession();
  const token = await storedAuthToken();
  if (!token || !authSessionIsCurrent(beforeRead)) return null;

  setAuthToken(token);
  const expected = captureAuthSession();
  const auth = await getCurrentAuth();
  if (!authSessionIsCurrent(expected)) return null;
  if (!auth) {
    await logoutIfSession(expected);
  }
  return auth;
}

export async function logout(): Promise<void> {
  setAuthToken(null);
  const expected = captureAuthSession();
  await credentialWrite(async () => {
    if (authSessionIsCurrent(expected)) await SecureStore.deleteItemAsync(TOKEN_KEY);
  });
}
