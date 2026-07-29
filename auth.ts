import * as SecureStore from 'expo-secure-store';
import { apiGet, apiPost, setAuthToken } from './api';

const TOKEN_KEY = 'auth_token';

interface LoginResponse {
  token: string;
}

interface MeResponse {
  auth: { distributor_id: string; client_id: string };
}

export async function login(username: string, password: string): Promise<void> {
  const { token } = await apiPost<LoginResponse>('/login', { username, password });
  await SecureStore.setItemAsync(TOKEN_KEY, token);
  setAuthToken(token);
}

// Called once on app launch. A stored token merely being present doesn't
// mean it's still valid (could be revoked backend-side before its 30-day
// expiry) - GET /me is the documented "is my token working" check, so use
// it here rather than trusting storage alone.
export async function restoreSession(): Promise<boolean> {
  const token = await SecureStore.getItemAsync(TOKEN_KEY);
  if (!token) return false;

  setAuthToken(token);
  try {
    await apiGet<MeResponse>('/me');
    return true;
  } catch {
    setAuthToken(null);
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return false;
  }
}

export async function logout(): Promise<void> {
  setAuthToken(null);
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}
