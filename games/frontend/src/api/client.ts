import { AUTH_EXPIRED_EVENT, TOKEN_KEY } from "../hooks/useAuth";

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export type PlayStatus =
  | "Backlog"
  | "Playing"
  | "Completed"
  | "Dropped"
  | "OnHold";
export type PlayMode = "Handheld" | "TV" | "CRT";
export type HardwareType = "Original" | "Modded" | "Emulator" | "Cloud";

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
  source: "Manual" | "Steam";
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Game {
  id: number;
  title: string;
  coverUrl: string | null;
  genre: string | null;
  releaseYear: number | null;
  developer: string | null;
  summary: string | null;
  igdbId: number | null;
  steamAppId: number | null;
  isFavourite: boolean;
  createdAt: string;
  userEntries: UserEntry[];
}

export interface Platform {
  id: number;
  name: string;
  abbreviation: string;
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

export interface CreateGamePayload {
  title: string;
  coverUrl?: string;
  genre?: string;
  releaseYear?: number;
  developer?: string;
  summary?: string;
  igdbId?: number;
  steamAppId?: number;
  entry: {
    platformId: number;
    status: string;
    hoursPlayed?: number;
    rating?: number;
    notes?: string;
    mode?: string;
    hardware?: string;
  };
}

// Changes to an entry; null clears a field
export type UpdateEntryPayload = Partial<
  Pick<
    UserEntry,
    | "platformId"
    | "status"
    | "hoursPlayed"
    | "rating"
    | "notes"
    | "achievementsEarned"
    | "achievementsTotal"
    | "mode"
    | "hardware"
    | "startedAt"
    | "completedAt"
  >
>;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  // Writes are rejected by the API without the admin token
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (res.status === 401 && token) {
    // Token expired or was invalidated — drop it so the UI falls back to guest mode
    localStorage.removeItem(TOKEN_KEY);
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  }
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getGames: () => request<Game[]>("/api/games"),
  getGame: (id: number) => request<Game>(`/api/games/${id}`),
  createGame: (p: CreateGamePayload) =>
    request<Game>("/api/games", { method: "POST", body: JSON.stringify(p) }),
  // PUT replaces the entry, so send every current field with the changes on top
  updateEntry: (gId: number, e: UserEntry, changes: UpdateEntryPayload) => {
    const { platformId, status, hoursPlayed, rating, notes, achievementsEarned,
      achievementsTotal, mode, hardware, startedAt, completedAt } = e;
    const body = { platformId, status, hoursPlayed, rating, notes, achievementsEarned,
      achievementsTotal, mode, hardware, startedAt, completedAt, ...changes };
    return request<Game>(`/api/games/${gId}/entries/${e.id}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
  deleteGame: (id: number) =>
    request<void>(`/api/games/${id}`, { method: "DELETE" }),
  getPlatforms: () => request<Platform[]>("/api/platforms"),
  search: (q: string) =>
    request<IgdbResult[]>(`/api/search?q=${encodeURIComponent(q)}`),
  syncSteam: () =>
    request<{
      added: number;
      updated: number;
      skipped: number;
      games: string[];
    }>("/api/steam/sync", { method: "POST" }),
  toggleFavourite: (id: number) =>
    request<Game>(`/api/games/${id}/favourite`, { method: "PATCH" }),
};
