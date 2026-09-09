import { useCallback, useEffect, useState } from "react";

export interface Route {
  path: string;
  /** Serialised query so effects can depend on the value, not the object. */
  search: string;
}

export type RouteParams = Record<string, string | number | boolean | undefined>;

function parseHash(): Route {
  const raw = window.location.hash.replace(/^#/, "");
  const [path, search = ""] = raw.split("?");
  return { path: path || "/", search };
}

function buildHash(path: string, params?: RouteParams): string {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === "" || value === false) continue;
    search.set(key, String(value));
  }

  const query = search.toString();
  return `#${path}${query ? `?${query}` : ""}`;
}

/**
 * Hash routing, so the browser's back button works, the library is
 * linkable with its filters, and GitHub Pages never has to serve a
 * path it does not have a file for.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<Route>(parseHash);

  useEffect(() => {
    const handleChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", handleChange);
    return () => window.removeEventListener("hashchange", handleChange);
  }, []);

  const navigate = useCallback((path: string, params?: RouteParams) => {
    const next = buildHash(path, params);
    if (next === window.location.hash) return;
    window.location.hash = next;
  }, []);

  const replace = useCallback((path: string, params?: RouteParams) => {
    const next = buildHash(path, params);
    if (next === window.location.hash) return;
    window.history.replaceState(null, "", next);
    setRoute(parseHash());
  }, []);

  return { route, navigate, replace };
}
