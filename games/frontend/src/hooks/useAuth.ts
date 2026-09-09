// src/hooks/useAuth.ts
// Manages login state across the app

import { useState, useEffect } from "react";

const TOKEN_KEY = "mittsmods_admin_token";
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [checking, setChecking] = useState(true);

  // On mount, verify any stored token is still valid
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setChecking(false);
      return;
    }

    fetch(`${BASE_URL}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => {
        setIsLoggedIn(r.ok);
        if (!r.ok) localStorage.removeItem(TOKEN_KEY);
      })
      .catch(() => {
        setIsLoggedIn(false);
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setChecking(false));
  }, []);

  const login = async (
    password: string,
  ): Promise<{ success: boolean; message?: string }> => {
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

    const data = await res.json().catch(() => ({}));
    return { success: false, message: data.message ?? "Incorrect password." };
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setIsLoggedIn(false);
  };

  return { isLoggedIn, checking, login, logout };
}
