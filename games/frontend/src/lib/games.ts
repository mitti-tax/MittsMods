import type { Game, PlayStatus, UserEntry } from "../api/client";

export const STATUSES: PlayStatus[] = ["Playing", "Backlog", "Completed", "OnHold", "Dropped"];
export const MODES = ["Handheld", "TV", "CRT"] as const;
export const HARDWARE = ["Original", "Modded", "Emulator", "Cloud"] as const;

export const STATUS_LABEL: Record<PlayStatus, string> = {
  Playing: "Playing",
  Backlog: "Backlog",
  Completed: "Completed",
  OnHold: "On hold",
  Dropped: "Dropped",
};

// Console family by seeded platform id (see backend AppDbContext): drives the spine colour
export type Family = "pc" | "xbox" | "playstation" | "nintendo" | "sega" | "other";
export function familyOf(platformId: number | undefined): Family {
  if (platformId === 1) return "pc";
  if (platformId! >= 2 && platformId! <= 5) return "xbox";
  if (platformId! >= 6 && platformId! <= 12) return "playstation";
  if (platformId! >= 13 && platformId! <= 25) return "nintendo";
  if (platformId === 26) return "sega";
  return "other";
}

export const entryOf = (g: Game): UserEntry | undefined => g.userEntries[0];

export function fmtHours(h: number | null | undefined): string {
  if (!h) return "";
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h).toLocaleString()} h`;
}

export const totalHours = (g: Game) =>
  g.userEntries.reduce((s, e) => s + (e.hoursPlayed ?? 0), 0);

const time = (s: string | undefined) => (s ? new Date(s).getTime() : 0);

export type SortKey = "recent" | "added" | "title" | "hours" | "rating";
export const SORTS: Record<SortKey, string> = {
  recent: "Recently played",
  added: "Recently added",
  title: "Title",
  hours: "Most played",
  rating: "Highest rated",
};

export function sortGames(games: Game[], key: SortKey): Game[] {
  const by: Record<SortKey, (a: Game, b: Game) => number> = {
    recent: (a, b) => time(entryOf(b)?.updatedAt) - time(entryOf(a)?.updatedAt),
    added: (a, b) => time(b.createdAt) - time(a.createdAt),
    title: (a, b) => a.title.localeCompare(b.title),
    hours: (a, b) => totalHours(b) - totalHours(a),
    rating: (a, b) => (entryOf(b)?.rating ?? 0) - (entryOf(a)?.rating ?? 0),
  };
  return [...games].sort(by[key]);
}

export interface LibraryFilter {
  status: PlayStatus | "All" | "Favourites";
  platformId: number | null;
  query: string;
  sort: SortKey;
}
export const DEFAULT_FILTER: LibraryFilter = {
  status: "All",
  platformId: null,
  query: "",
  sort: "recent",
};

export function matches(g: Game, f: LibraryFilter, ignoreStatus = false): boolean {
  if (!ignoreStatus) {
    if (f.status === "Favourites" && !g.isFavourite) return false;
    if (f.status !== "All" && f.status !== "Favourites" && !g.userEntries.some((e) => e.status === f.status))
      return false;
  }
  if (f.platformId && !g.userEntries.some((e) => e.platformId === f.platformId)) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !`${g.title} ${g.developer ?? ""}`.toLowerCase().includes(q)) return false;
  return true;
}

// Entry form values as typed; validated before saving
export interface EntryDraft {
  platformId: number;
  status: PlayStatus;
  mode: string;
  hardware: string;
  hours: string;
  rating: string;
  notes: string;
}

export function draftError(d: EntryDraft): string | null {
  if (d.hours && !(Number(d.hours) >= 0)) return "Hours can't be negative.";
  if (d.rating && !/^(10|[1-9])$/.test(d.rating.trim())) return "Rating is a whole number from 1 to 10.";
  return null;
}
