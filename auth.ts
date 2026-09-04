import * as SecureStore from 'expo-secure-store';
import { apiGet, apiPost, setAuthToken } from './api';

const TOKEN_KEY = 'auth_token';

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
  const { token } = await apiPost<LoginResponse>('/login', { username, password });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  setAuthToken(token);
}

// POST /register (API_CONTRACT.md) - self-registration for internal test
// participants, gated behind ENABLE_SELF_REGISTRATION on both ends (see
// config.ts). Same response shape as login() - a token, usable immediately
// - so callers can treat a successful registration exactly like a
// successful login from this point on. `phone` and `password` are both
// required now (phone is the identifier loginByPhone() logs back in with) -
// send whatever format the user typed for phone, the backend normalizes it.
// A 409 (phone already registered) comes back as an ApiError with
// code === 'phone_already_registered' - callers should catch that
// specifically and route to sign-in rather than showing it as a generic
// error (API_CONTRACT.md).
export async function register(name: string, phone: string, password: string): Promise<void> {
  const { token } = await apiPost<LoginResponse>('/register', { name, phone, password });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  setAuthToken(token);
}

// POST /login/phone (API_CONTRACT.md) - login counterpart to register(),
// for distributors who signed up that way. Same gating (ENABLE_SELF_
// REGISTRATION) and same response shape as login()/register(). Wrong
// password and unknown phone both come back as the same generic 401
// message - don't build UI copy that assumes which one happened.
export async function loginByPhone(phone: string, password: string): Promise<void> {
  const { token } = await apiPost<LoginResponse>('/login/phone', { phone, password });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  setAuthToken(token);
}

// Confirms the current token against the backend and returns the ids it's
// scoped to, or null if there's no token / it's no longer valid. Used both
// by restoreSession() below and right after a fresh login (login() itself
// doesn't call /me, so callers that need distributorId right away call this
// once login() resolves).
export async function getCurrentAuth(): Promise<CurrentAuth | null> {
  try {
    const { auth } = await apiGet<MeResponse>('/me');
    return { distributorId: auth.distributor_id, clientId: auth.client_id };
  } catch {
    return null;
  }
}

// Called once on app launch. A stored token merely being present doesn't
// mean it's still valid (could be revoked backend-side before its 30-day
// expiry) - GET /me is the documented "is my token working" check, so use
// it here rather than trusting storage alone.
export async function restoreSession(): Promise<CurrentAuth | null> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return null;

  setAuthToken(token);
  const auth = await getCurrentAuth();
  if (!auth) {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  }
  return auth;
}

export async function logout(): Promise<void> {
  setAuthToken(null);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
