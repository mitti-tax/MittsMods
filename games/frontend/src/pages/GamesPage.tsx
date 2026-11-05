import { useState } from "react";
import type { Game, Platform, PlayStatus } from "../api/client";
import GameCard from "../components/GameCard";
import {
  DEFAULT_FILTER,
  SORTS,
  STATUSES,
  STATUS_LABEL,
  matches,
  sortGames,
  type LibraryFilter,
  type SortKey,
} from "../lib/games";

interface Props {
  games: Game[];
  platforms: Platform[];
  filter: LibraryFilter;
  onFilter: (f: LibraryFilter) => void;
  isLoggedIn: boolean;
  onOpen: (g: Game) => void;
  onAdd: () => void;
  onLoginRequest: () => void;
  onQuickStatus: (g: Game, s: PlayStatus) => void;
}

export default function GamesPage({
  games,
  platforms,
  filter,
  onFilter,
  isLoggedIn,
  onOpen,
  onAdd,
  onLoginRequest,
  onQuickStatus,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const set = (patch: Partial<LibraryFilter>) => onFilter({ ...filter, ...patch });

  // Chip counts respect search and platform, so they match what you'll see
  const pool = games.filter((g) => matches(g, filter, true));
  const countOf = (s: LibraryFilter["status"]) =>
    s === "All"
      ? pool.length
      : s === "Favourites"
        ? pool.filter((g) => g.isFavourite).length
        : pool.filter((g) => g.userEntries.some((e) => e.status === s)).length;
  const chips = (["All", ...STATUSES, "Favourites"] as LibraryFilter["status"][]).filter(
    (s) => s !== "Favourites" || countOf(s) > 0 || filter.status === s,
  );

  const shown = sortGames(
    pool.filter((g) => matches(g, { ...filter, query: "", platformId: null })),
    filter.sort,
  );

  // Only platforms that have games, with counts
  const usedPlatforms = platforms
    .map((p) => ({ ...p, n: games.filter((g) => g.userEntries.some((e) => e.platformId === p.id)).length }))
    .filter((p) => p.n > 0 || p.id === filter.platformId);

  const filtered = filter.status !== "All" || filter.platformId !== null || filter.query.trim() !== "";

  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title desktop-only">Library</span>
        {isLoggedIn && (
          <div className="section-actions">
            <button className={`btn ${editMode ? "btn-primary" : "btn-ghost"}`} onClick={() => setEditMode((e) => !e)}>
              {editMode ? "✓ Done" : "✎ Edit Mode"}
            </button>
            <button className="btn btn-primary" onClick={onAdd}>
              + Add Game
            </button>
          </div>
        )}
      </div>

      {editMode && isLoggedIn && (
        <div className="notice notice-edit">EDIT MODE — Change a status from the menu on any card. It saves instantly.</div>
      )}

      {!isLoggedIn && (
        <div className="notice">
          <span>👁 Viewing as guest — read only</span>
          <button className="notice-link" onClick={onLoginRequest}>
            Log in →
          </button>
        </div>
      )}

      <div className="library-toolbar">
        <input
          className="form-input library-search"
          type="search"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Search games"
          placeholder="Search titles and developers..."
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        <select
          className="form-select"
          aria-label="Platform"
          value={filter.platformId ?? ""}
          onChange={(e) => set({ platformId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">All platforms</option>
          {usedPlatforms.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.n})
            </option>
          ))}
        </select>
        <select
          className="form-select"
          aria-label="Sort by"
          value={filter.sort}
          onChange={(e) => set({ sort: e.target.value as SortKey })}
        >
          {Object.entries(SORTS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="filter-bar" role="group" aria-label="Status">
        {chips.map((s) => (
          <button
            key={s}
            className={`filter-chip ${filter.status === s ? "active" : ""}`}
            aria-pressed={filter.status === s}
            onClick={() => set({ status: s })}
          >
            {s === "Favourites" ? "★ Favourites" : s === "All" ? "All" : STATUS_LABEL[s]}
            <span className="chip-count">{countOf(s)}</span>
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="empty-state">
          <p>NO GAMES FOUND</p>
          <p className="empty-state-sub">
            {filter.query.trim() ? `Nothing matches "${filter.query.trim()}" with these filters.` : "Nothing fits these filters."}
          </p>
          {filtered && (
            <button className="btn btn-ghost" onClick={() => onFilter({ ...DEFAULT_FILTER, sort: filter.sort })}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="result-count" aria-live="polite">
            {shown.length} {shown.length === 1 ? "GAME" : "GAMES"}
          </div>
          <div className="games-grid">
            {shown.map((g) => (
              <GameCard key={g.id} game={g} onOpen={onOpen} onStatus={editMode && isLoggedIn ? onQuickStatus : undefined} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
