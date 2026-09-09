import { useCallback, useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import { clearToken, getToken, onTokenChange } from "../api/token";

export interface AuthState {
  isLoggedIn: boolean;
  checking: boolean;
  login: (password: string) => Promise<{ success: boolean; message?: string }>;
  logout: () => void;
}

/**
 * Tracks the admin session. The token itself lives in api/token so that a 401
 * from any request drops the session and the UI follows immediately, rather
 * than leaving admin buttons on screen that will all fail.
 */
export function useAuth(): AuthState {
  const hadToken = getToken() !== null;
  const [isLoggedIn, setIsLoggedIn] = useState(hadToken);
  const [checking, setChecking] = useState(hadToken);

  useEffect(() => onTokenChange(() => setIsLoggedIn(getToken() !== null)), []);

  useEffect(() => {
    // `checking` already starts false when there was no token to check.
    if (!getToken()) return;

    let cancelled = false;
    void api.verify().then((valid) => {
      if (cancelled) return;
      setIsLoggedIn(valid);
      setChecking(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (password: string): Promise<{ success: boolean; message?: string }> => {
      try {
        await api.login(password);
        setIsLoggedIn(true);
        return { success: true };
      } catch (error) {
        const message =
          error instanceof ApiError ? error.message : "Could not log in.";
        return { success: false, message };
      }
    },
    [],
  );

  const logout = useCallback(() => {
    clearToken();
    setIsLoggedIn(false);
  }, []);

  return { isLoggedIn, checking, login, logout };
}
