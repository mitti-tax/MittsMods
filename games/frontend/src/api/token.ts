// Admin session token storage.
//
// Kept separate from the API client and the auth hook so both can read it
// without importing each other, and so every localStorage access is guarded —
// it throws outright in some privacy modes.

const TOKEN_KEY = "mittsmods_admin_token";
const EXPIRY_KEY = "mittsmods_admin_token_expires";

type Listener = () => void;
const listeners = new Set<Listener>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage unavailable — the session simply lasts until reload.
  }
}

export function getToken(): string | null {
  const token = read(TOKEN_KEY);
  if (!token) return null;

  // Expiry is checked here as well as on the server so an obviously dead
  // token never gets sent, and the UI drops to guest mode straight away.
  const expiresAt = read(EXPIRY_KEY);
  if (expiresAt) {
    const expiry = Date.parse(expiresAt);
    if (!Number.isNaN(expiry) && expiry <= Date.now()) {
      clearToken();
      return null;
    }
  }

  return token;
}

export function setToken(token: string, expiresAt?: string | null): void {
  write(TOKEN_KEY, token);
  write(EXPIRY_KEY, expiresAt ?? null);
  notify();
}

export function clearToken(): void {
  write(TOKEN_KEY, null);
  write(EXPIRY_KEY, null);
  notify();
}

/** Notifies subscribers when the token is set or dropped (including on a 401). */
export function onTokenChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}
