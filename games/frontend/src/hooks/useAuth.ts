// Manages login state across the app
import { useEffect, useState } from "react";

export const TOKEN_KEY = "mittsmods_admin_token";
export const AUTH_EXPIRED_EVENT = "mittsmods-auth-expired";
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const storedToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};

export function useAuth() {
  // Trust a stored token straight away so the admin UI doesn't flash the guest view;
  // the check below drops it if the server says it's no longer valid
  const [isLoggedIn, setIsLoggedIn] = useState(() => !!storedToken());

  useEffect(() => {
    const token = storedToken();
    if (!token) return;
    fetch(`${BASE_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        if (r.ok) return;
        localStorage.removeItem(TOKEN_KEY);
        setIsLoggedIn(false);
      })
      // Offline or API down: keep the token. A write would get a 401 if it really expired.
      .catch(() => {});
  }, []);

  // The API client fires this when a write comes back 401 (token expired mid-session)
  useEffect(() => {
    const onExpired = () => setIsLoggedIn(false);
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired);
  }, []);

  const login = async (password: string): Promise<{ success: boolean; message?: string }> => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      const { token } = await res.json();
      localStorage.setItem(TOKEN_KEY, token);
      setIsLoggedIn(true);
      return { success: true };
    }
    if (res.status === 429) return { success: false, message: "Too many tries. Wait a minute and try again." };
    const data = await res.json().catch(() => ({}));
    return { success: false, message: data.message ?? "Incorrect password." };
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setIsLoggedIn(false);
  };

  return { isLoggedIn, login, logout };
}
