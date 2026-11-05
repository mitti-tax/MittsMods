import type { Game, Platform, PlayStatus, UserEntry } from "../api/client";

export const STATUSES: PlayStatus[] = ["Backlog", "Playing", "Completed", "Dropped", "OnHold", "Wishlist"];
export const MODES = ["Handheld", "TV", "CRT"] as const;
export const HARDWARE = ["Original", "Modded", "Emulator", "Cloud"] as const;

export const STATUS_LABEL: Record<PlayStatus, string> = {
  Playing: "Playing",
  Backlog: "Backlog",
  Completed: "Completed",
  OnHold: "On hold",
  Dropped: "Dropped",
  Wishlist: "Wishlist",
};

export const entryOf = (g: Game): UserEntry | undefined => g.userEntries[0];

export function fmtHours(h: number | null | undefined): string {
  if (!h) return "";
  return `${h < 10 ? Math.round(h * 10) / 10 : Math.round(h).toLocaleString()}h`;
}

export const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "";

export const totalHours = (g: Game) => g.userEntries.reduce((s, e) => s + (e.hoursPlayed ?? 0), 0);

const time = (s: string | null | undefined) => (s ? new Date(s).getTime() : 0);

// Steam's last-played date; a manual entry's last edit stands in for it.
// A Steam game with no last-played date was never launched, so it counts as never played.
export const lastPlayed = (g: Game) =>
  Math.max(0, ...g.userEntries.map((e) => time(e.lastPlayedAt) || (e.source === "Steam" ? 0 : time(e.updatedAt))));

// Owned and not hidden: what the library counts
export const owned = (games: Game[]) =>
  games.filter((g) => !g.isHidden && !g.userEntries.every((e) => e.status === "Wishlist"));

export type SortKey = "recent" | "added" | "title" | "hours" | "rating" | "year";
export const SORTS: Record<SortKey, string> = {
  recent: "Recently played",
  added: "Recently added",
  title: "Title",
  hours: "Most played",
  rating: "Highest rated",
  year: "Release year",
};

export function sortGames(games: Game[], key: SortKey): Game[] {
  const by: Record<SortKey, (a: Game, b: Game) => number> = {
    recent: (a, b) => lastPlayed(b) - lastPlayed(a),
    added: (a, b) => time(b.createdAt) - time(a.createdAt),
    title: (a, b) => a.title.localeCompare(b.title),
    hours: (a, b) => totalHours(b) - totalHours(a),
    rating: (a, b) => (entryOf(b)?.rating ?? 0) - (entryOf(a)?.rating ?? 0),
    year: (a, b) => (b.releaseYear ?? 0) - (a.releaseYear ?? 0),
  };
  return [...games].sort(by[key]);
}

export type StatusFilter = PlayStatus | "All" | "Favourites" | "Hidden";

export interface LibraryFilter {
  status: StatusFilter;
  platformId: number | null;
  genre: string | null;
  hardware: string | null;
  decade: number | null; // 1990 = the 1990s
  query: string;
  sort: SortKey;
}
export const DEFAULT_FILTER: LibraryFilter = {
  status: "All",
  platformId: null,
  genre: null,
  hardware: null,
  decade: null,
  query: "",
  sort: "recent",
};

export function matches(g: Game, f: LibraryFilter, ignoreStatus = false): boolean {
  if (!ignoreStatus) {
    // Hidden games only show under their own filter
    if (f.status === "Hidden") {
      if (!g.isHidden) return false;
    } else if (g.isHidden) return false;
    else if (f.status === "Favourites" && !g.isFavourite) return false;
    else if (f.status !== "All" && f.status !== "Favourites" && !g.userEntries.some((e) => e.status === f.status))
      return false;
  }
  if (f.platformId && !g.userEntries.some((e) => e.platformId === f.platformId)) return false;
  if (f.hardware && !g.userEntries.some((e) => e.hardware === f.hardware)) return false;
  if (f.genre && g.genre !== f.genre) return false;
  if (f.decade && !(g.releaseYear && Math.floor(g.releaseYear / 10) * 10 === f.decade)) return false;
  const q = f.query.trim().toLowerCase();
  if (q && !`${g.title} ${g.developer ?? ""} ${g.genre ?? ""}`.toLowerCase().includes(q)) return false;
  return true;
}

// The filter lives in the URL (#/games?status=Completed&platform=19) so links and Back work
const PARAM: Record<keyof LibraryFilter, string> = {
  status: "status",
  platformId: "platform",
  genre: "genre",
  hardware: "hardware",
  decade: "decade",
  query: "q",
  sort: "sort",
};

export function filterFromParams(p: URLSearchParams, base: LibraryFilter): LibraryFilter {
  const num = (k: string) => (p.get(k) && Number.isFinite(Number(p.get(k))) ? Number(p.get(k)) : null);
  const sort = p.get("sort") as SortKey | null;
  const status = p.get("status") as StatusFilter | null;
  return {
    status: status && (["All", "Favourites", "Hidden", ...STATUSES] as string[]).includes(status) ? status : base.status,
    platformId: num("platform") ?? base.platformId,
    genre: p.get("genre") ?? base.genre,
    hardware: p.get("hardware") ?? base.hardware,
    decade: num("decade") ?? base.decade,
    query: p.get("q") ?? base.query,
    sort: sort && sort in SORTS ? sort : base.sort,
  };
}

// Only what differs from the page's default, so URLs stay short
export function filterToParams(f: LibraryFilter, base: LibraryFilter): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of Object.keys(PARAM) as (keyof LibraryFilter)[]) {
    const v = f[k];
    if (v !== base[k] && v !== null && v !== "") p.set(PARAM[k], String(v));
  }
  return p;
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
  started: string; // yyyy-mm-dd or ""
  completed: string;
}

export function draftError(d: EntryDraft): string | null {
  if (d.hours && !(Number(d.hours) >= 0)) return "Hours can't be negative.";
  if (d.rating && !/^(10|[1-9])$/.test(d.rating.trim())) return "Rating is a whole number from 1 to 10.";
  if (d.started && d.completed && d.completed < d.started) return "Finished can't be before started.";
  return null;
}

// Date inputs work in calendar days. Read and write them in the viewer's own time zone, so the
// day picked is the day shown (fmtDate is local too). Noon keeps it clear of midnight edges.
export function toDay(s: string | null | undefined): string {
  if (!s) return "";
  const d = new Date(s);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const fromDay = (d: string) => (d ? new Date(`${d}T12:00:00`).toISOString() : null);

export const emptyDraft = (platforms: Platform[]): EntryDraft => ({
  // Platforms arrive sorted by name (Game Boy first), so default to PC
  platformId: platforms.find((p) => p.name === "PC")?.id ?? platforms[0]?.id ?? 1,
  status: "Backlog",
  mode: "",
  hardware: "Original",
  hours: "",
  rating: "",
  notes: "",
  started: "",
  completed: "",
});

// Draft -> API fields for a new entry (empty fields left out)
export const newEntry = (d: EntryDraft) => ({
  platformId: d.platformId,
  status: d.status,
  mode: d.mode || undefined,
  hardware: d.hardware,
  hoursPlayed: d.hours ? Number(d.hours) : undefined,
  rating: d.rating ? Number(d.rating) : undefined,
  notes: d.notes.trim() || undefined,
  startedAt: fromDay(d.started) ?? undefined,
  completedAt: fromDay(d.completed) ?? undefined,
});

export const playtimeTotal = (games: Game[]) => games.reduce((s, g) => s + (g.timeToBeatHours ?? 0), 0);

// Spreadsheet-friendly export: one row per platform entry
export function toCsv(games: Game[]): string {
  const cols = ["Title", "Platform", "Status", "Hours", "Rating", "Hardware", "Mode", "Started", "Finished",
    "Last played", "Genre", "Year", "Developer", "Favourite", "Hidden", "Time to beat", "Notes"];
  const cell = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = games.flatMap((g) =>
    g.userEntries.map((e) => [g.title, e.platformName, e.status, e.hoursPlayed, e.rating, e.hardware, e.mode,
      toDay(e.startedAt), toDay(e.completedAt), toDay(e.lastPlayedAt), g.genre, g.releaseYear, g.developer,
      g.isFavourite ? "yes" : "", g.isHidden ? "yes" : "", g.timeToBeatHours, e.notes]),
  );
  return [cols, ...rows].map((r) => r.map(cell).join(",")).join("\n");
}
