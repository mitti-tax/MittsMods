import { clearToken, getToken, setToken } from "./token";

// In dev VITE_API_URL is unset, so requests stay relative and go through the
// Vite proxy to localhost:5000 — no CORS round trip. Production sets it.
const BASE_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export type PlayStatus =
  | "Backlog"
  | "Playing"
  | "Completed"
  | "Dropped"
  | "OnHold";
export type PlayMode = "Handheld" | "TV" | "CRT";
export type HardwareType = "Original" | "Modded" | "Emulator" | "Cloud";
export type EntrySource = "Manual" | "Steam";

export interface UserEntry {
  id: number;
  platformId: number;
  platformName: string;
  status: PlayStatus;
  hoursPlayed: number | null;
  rating: number | null;
  notes: string | null;
  achievementsEarned: number | null;
  achievementsTotal: number | null;
  mode: PlayMode | null;
  hardware: HardwareType;
  source: EntrySource;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** A game as returned by list endpoints — no summary, to keep pages small. */
export interface GameListItem {
  id: number;
  title: string;
  coverUrl: string | null;
  genre: string | null;
  releaseYear: number | null;
  developer: string | null;
  igdbId: number | null;
  steamAppId: number | null;
  isFavourite: boolean;
  createdAt: string;
  userEntries: UserEntry[];
}

/** A game with its full metadata, from GET /api/games/{id}. */
export interface Game extends GameListItem {
  summary: string | null;
}

export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export interface Platform {
  id: number;
  name: string;
  abbreviation: string | null;
}

export interface IgdbResult {
  id: number;
  name: string;
  summary: string | null;
  coverUrl: string | null;
  releaseYear: number | null;
  genres: string[];
  developers: string[];
  platforms: string[];
}

export interface PlatformStat {
  platformId: number;
  platformName: string;
  games: number;
  hours: number;
}

export interface LibraryStats {
  totalGames: number;
  totalEntries: number;
  totalHours: number;
  favourites: number;
  averageRating: number | null;
  achievementsEarned: number;
  achievementsTotal: number;
  gamesByStatus: Partial<Record<PlayStatus, number>>;
  topPlatforms: PlatformStat[];
}

export interface GameQueryParams {
  q?: string;
  status?: PlayStatus | "";
  platformId?: number;
  favourite?: boolean;
  minHours?: number;
  sort?: "title" | "-title" | "added" | "played" | "hours" | "rating" | "year";
  page?: number;
  pageSize?: number;
}

export interface EntryPayload {
  platformId: number;
  status: PlayStatus;
  hoursPlayed?: number | null;
  rating?: number | null;
  notes?: string | null;
  achievementsEarned?: number | null;
  achievementsTotal?: number | null;
  mode?: PlayMode | null;
  hardware?: HardwareType | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface CreateGamePayload {
  title: string;
  coverUrl?: string | null;
  genre?: string | null;
  releaseYear?: number | null;
  developer?: string | null;
  summary?: string | null;
  igdbId?: number | null;
  steamAppId?: number | null;
  entry: EntryPayload;
}

export interface SteamSyncResult {
  added: number;
  updated: number;
  unchanged: number;
  skipped: number;
  remaining: number;
  games: string[];
}

/** An API failure carrying the status and the server's own message. */
export class ApiError extends Error {
  readonly status: number;
  /** Set when the server pointed at an existing record (duplicate add). */
  readonly gameId?: number;

  constructor(status: number, message: string, gameId?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.gameId = gameId;
  }

  /** True when the request failed before the server answered. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers: extraHeaders, ...init } = options;

  const headers = new Headers(extraHeaders);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiError(0, "Could not reach the server. Check your connection.");
  }

  if (!response.ok) throw await toApiError(response);

  if (response.status === 204) return undefined as T;

  return (await response.json()) as T;
}

async function toApiError(response: Response): Promise<ApiError> {
  let detail: string | undefined;
  let gameId: number | undefined;

  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object") {
      const record = payload as Record<string, unknown>;
      if (typeof record.detail === "string") detail = record.detail;
      else if (typeof record.title === "string") detail = record.title;
      if (typeof record.gameId === "number") gameId = record.gameId;

      // ASP.NET validation problems put the useful text under "errors".
      if (!detail && record.errors && typeof record.errors === "object") {
        const first = Object.values(record.errors as Record<string, unknown>)[0];
        if (Array.isArray(first) && typeof first[0] === "string") detail = first[0];
      }
    }
  } catch {
    // Non-JSON error body — fall back to a status-based message.
  }

  if (response.status === 401) {
    // The session is gone; drop it so the UI stops offering admin actions.
    clearToken();
    detail ??= "Your session expired. Log in again.";
  }

  detail ??= fallbackMessage(response.status);
  return new ApiError(response.status, detail, gameId);
}

function fallbackMessage(status: number): string {
  if (status === 403) return "You do not have permission to do that.";
  if (status === 404) return "Not found.";
  if (status === 409) return "That conflicts with something already saved.";
  if (status === 429) return "Too many requests — wait a moment and try again.";
  if (status === 502 || status === 503) return "An upstream service is unavailable.";
  if (status >= 500) return "The server hit an error. Try again shortly.";
  return `Request failed (${status}).`;
}

function toQueryString(params: GameQueryParams): string {
  const search = new URLSearchParams();

  if (params.q) search.set("q", params.q);
  if (params.status) search.set("status", params.status);
  if (params.platformId) search.set("platformId", String(params.platformId));
  if (params.favourite) search.set("favourite", "true");
  if (params.minHours !== undefined) search.set("minHours", String(params.minHours));
  if (params.sort) search.set("sort", params.sort);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));

  const query = search.toString();
  return query ? `?${query}` : "";
}

export const api = {
  getGames: (params: GameQueryParams = {}, signal?: AbortSignal) =>
    request<Paged<GameListItem>>(`/api/games${toQueryString(params)}`, { signal }),

  getGame: (id: number, signal?: AbortSignal) =>
    request<Game>(`/api/games/${id}`, { signal }),

  getStats: (signal?: AbortSignal) =>
    request<LibraryStats>("/api/games/stats", { signal }),

  getPlatforms: (signal?: AbortSignal) =>
    request<Platform[]>("/api/platforms", { signal }),

  createGame: (payload: CreateGamePayload) =>
    request<Game>("/api/games", { method: "POST", body: payload }),

  addEntry: (gameId: number, payload: EntryPayload) =>
    request<Game>(`/api/games/${gameId}/entries`, { method: "POST", body: payload }),

  updateEntry: (gameId: number, entryId: number, payload: EntryPayload) =>
    request<Game>(`/api/games/${gameId}/entries/${entryId}`, {
      method: "PUT",
      body: payload,
    }),

  deleteEntry: (gameId: number, entryId: number) =>
    request<Game>(`/api/games/${gameId}/entries/${entryId}`, { method: "DELETE" }),

  deleteGame: (id: number) =>
    request<void>(`/api/games/${id}`, { method: "DELETE" }),

  toggleFavourite: (id: number) =>
    request<Game>(`/api/games/${id}/favourite`, { method: "PATCH" }),

  search: (q: string, signal?: AbortSignal) =>
    request<IgdbResult[]>(`/api/search?q=${encodeURIComponent(q)}`, { signal }),

  syncSteam: () => request<SteamSyncResult>("/api/steam/sync", { method: "POST" }),

  login: async (password: string): Promise<void> => {
    const result = await request<{ token: string; expiresAt: string }>(
      "/api/auth/login",
      { method: "POST", body: { password } },
    );
    setToken(result.token, result.expiresAt);
  },

  verify: async (): Promise<boolean> => {
    const token = getToken();
    if (!token) return false;
    try {
      // The header alone would do; the body keeps the request valid for the
      // older server contract too.
      await request<{ valid: boolean }>("/api/auth/verify", {
        method: "POST",
        body: { token },
      });
      return true;
    } catch {
      // request() already dropped the token on a 401.
      return false;
    }
  },
};
