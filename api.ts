// Thin fetch wrapper around the backend described in API_CONTRACT.md.
// Base URL comes from EXPO_PUBLIC_API_BASE_URL (see .env.local) - Expo's
// babel preset inlines EXPO_PUBLIC_* vars at build time, no extra
// dependency needed.

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL;

// Every error response in the contract is `{ error: string, message?: string }`.
// Thrown so callers can use ordinary try/catch instead of checking `ok` everywhere.
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let authToken: string | null = null;

// Called by the auth layer (Goal 2) once a token is available/cleared.
// A module-level setter, not a param on every call, so every other call
// site in the app doesn't need to know or care about the token.
export function setAuthToken(token: string | null): void {
  authToken = token;
}

// Fired once, from whichever call site's request happens to be the first to
// hit one of these three codes (API_CONTRACT.md's documented 401 reasons for
// any authenticated route - missing_token/token_expired/invalid_token all
// mean the same thing from the user's side: log in again). Distinct from a
// plain 401 check - a login/register/login-by-phone attempt itself 401ing on
// bad credentials returns a different, unrelated error string
// ("Invalid username or password" etc.), never one of these three codes, so
// checking the code (not just the status) is what keeps this from
// misfiring on a normal failed login attempt. AppFlow.tsx registers this
// once on mount so a token dying mid-flow (e.g. mid-upload) forces a clean
// logout + redirect to login instead of every call site individually having
// to know what these codes mean (FRONTEND_AUDIT's §1 "Session/auth token
// expired mid-flow" finding - previously this surfaced only as a raw error
// string wherever the failing call happened to be caught, with no path back
// to a working state short of manually finding Logout in Profile).
const SESSION_EXPIRED_CODES = new Set(['token_expired', 'invalid_token', 'missing_token']);

let onSessionExpired: (() => void) | null = null;

export function setSessionExpiredHandler(handler: (() => void) | null): void {
  onSessionExpired = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  if (!API_BASE_URL) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE_URL is not set - check .env.local and restart the dev server.',
    );
  }

  const headers: Record<string, string> = {};
  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch (error) {
    throw new ApiError(0, 'network_error', 'Could not reach the server. Check your connection.');
  }

  // 204/empty responses aren't in the contract anywhere, but guard anyway
  // rather than letting JSON.parse throw on an empty body.
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const code = data.error ?? 'unknown_error';
    // A real 403 (e.g. permission-denied) or any other error code must fall
    // straight through to the normal ApiError path below, unhandled here -
    // only these three specific codes mean "the session itself is dead."
    if (SESSION_EXPIRED_CODES.has(code)) {
      onSessionExpired?.();
    }
    throw new ApiError(response.status, code, data.message ?? data.error ?? 'Something went wrong.');
  }

  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body });
}
