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
    throw new ApiError(response.status, data.error ?? 'unknown_error', data.message ?? data.error ?? 'Something went wrong.');
  }

  return data as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body });
}
