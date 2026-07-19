// Account auth client: persistent one-time login. The bearer token lives in
// localStorage (unlike the per-tab sessionStorage sessionId, which is only a
// room-resume credential) so a returning visitor is still signed in. The
// token dies only on explicit logout or server-side revocation.

const AUTH_TOKEN_KEY = "authToken";
const AUTH_USERNAME_KEY = "authUsername";

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUsername(): string | null {
  return localStorage.getItem(AUTH_USERNAME_KEY);
}

function storeAuth(token: string, username: string): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USERNAME_KEY, username);
}

function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USERNAME_KEY);
}

export type AuthOutcome =
  | { ok: true; username: string }
  | { ok: false; error: string };

async function credentialRequest(
  path: "/auth/signup" | "/auth/login",
  username: string,
  password: string,
): Promise<AuthOutcome> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const body = (await response.json()) as {
      token?: string;
      username?: string;
      error?: string;
    };
    if (!response.ok || body.token === undefined || body.username === undefined) {
      return { ok: false, error: body.error ?? "Something went wrong. Try again." };
    }
    storeAuth(body.token, body.username);
    return { ok: true, username: body.username };
  } catch {
    return { ok: false, error: "Could not reach the server. Try again." };
  }
}

export function signUp(username: string, password: string): Promise<AuthOutcome> {
  return credentialRequest("/auth/signup", username, password);
}

export function logIn(username: string, password: string): Promise<AuthOutcome> {
  return credentialRequest("/auth/login", username, password);
}

/**
 * Boot-time re-entry check: validates the stored token against the server.
 * Returns the canonical username when still signed in, null when signed
 * out (missing/revoked token — cleared locally so the UI shows the door).
 * Network failures fall back to the cached username: better to let an
 * offline-refresh player through than lock them out at the splash.
 */
export async function checkAuth(): Promise<string | null> {
  const token = getAuthToken();
  if (token === null) return null;
  try {
    const response = await fetch("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
      clearAuth();
      return null;
    }
    if (!response.ok) return getStoredUsername();
    const body = (await response.json()) as { username: string };
    localStorage.setItem(AUTH_USERNAME_KEY, body.username);
    return body.username;
  } catch {
    return getStoredUsername();
  }
}

export async function logOut(): Promise<void> {
  const token = getAuthToken();
  clearAuth();
  if (token === null) return;
  try {
    await fetch("/auth/logout", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Local sign-out already happened; server-side revocation is best-effort.
  }
}
