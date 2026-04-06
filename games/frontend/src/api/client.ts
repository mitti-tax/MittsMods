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

export interface UpdateEntryPayload {
  platformId?: number;
  status?: string;
  hoursPlayed?: number;
  rating?: number;
  notes?: string;
  achievementsEarned?: number;
  achievementsTotal?: number;
  mode?: string;
  hardware?: string;
  startedAt?: string;
  completedAt?: string;
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getGames: () => request<Game[]>("/api/games"),
  getGame: (id: number) => request<Game>(`/api/games/${id}`),
  createGame: (p: CreateGamePayload) =>
    request<Game>("/api/games", { method: "POST", body: JSON.stringify(p) }),
  updateEntry: (gId: number, eId: number, p: UpdateEntryPayload) =>
    request<Game>(`/api/games/${gId}/entries/${eId}`, {
      method: "PUT",
      body: JSON.stringify(p),
    }),
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
