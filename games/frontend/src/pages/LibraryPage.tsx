import { useContext, useState } from "react";
import type { Game, PlayStatus } from "../api/client";
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
import { PlatformsContext } from "../lib/platforms";

interface Props {
  games: Game[];
  filter: LibraryFilter;
  onFilter: (f: LibraryFilter) => void;
  isLoggedIn: boolean;
  onOpen: (g: Game) => void;
  onAdd: () => void;
  onQuickStatus: (g: Game, s: PlayStatus) => void;
}

export default function LibraryPage({ games, filter, onFilter, isLoggedIn, onOpen, onAdd, onQuickStatus }: Props) {
  const platforms = useContext(PlatformsContext);
  const [editing, setEditing] = useState(false);
  const set = (patch: Partial<LibraryFilter>) => onFilter({ ...filter, ...patch });

  // Chip counts respect search and console, so they always add up to what you'd see
  const pool = games.filter((g) => matches(g, filter, true));
  const countOf = (s: LibraryFilter["status"]) =>
    s === "All"
      ? pool.length
      : s === "Favourites"
        ? pool.filter((g) => g.isFavourite).length
        : pool.filter((g) => g.userEntries.some((e) => e.status === s)).length;
  // Empty statuses only add noise, unless it's the one you're filtering by
  const chips = (["All", ...STATUSES, "Favourites"] as LibraryFilter["status"][]).filter(
    (s) => s === "All" || s === filter.status || countOf(s) > 0,
  );

  const shown = sortGames(
    pool.filter((g) => matches(g, { ...filter, query: "", platformId: null })),
    filter.sort,
  );

  const consoles = platforms
    .map((p) => ({ ...p, n: games.filter((g) => g.userEntries.some((e) => e.platformId === p.id)).length }))
    .filter((p) => p.n > 0 || p.id === filter.platformId);

  const filtered =
    filter.status !== "All" || filter.platformId !== null || filter.query.trim() !== "";

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title desktop-only">Library</h1>
        {isLoggedIn && (
          <div className="page-actions">
            <button
              className={`btn ${editing ? "btn-primary" : "btn-ghost"}`}
              aria-pressed={editing}
              onClick={() => setEditing((e) => !e)}
            >
              {editing ? "Done" : "Edit statuses"}
            </button>
            <button className="btn btn-primary" onClick={onAdd}>
              Add game
            </button>
          </div>
        )}
      </div>

      <div className="toolbar">
        <input
          className="input search"
          type="search"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Search the library"
          placeholder="Search titles and developers"
          value={filter.query}
          onChange={(e) => set({ query: e.target.value })}
        />
        <select
          className="input"
          aria-label="Console"
          value={filter.platformId ?? ""}
          onChange={(e) => set({ platformId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Every console</option>
          {consoles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.n})
            </option>
          ))}
        </select>
        <select
          className="input"
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

      <div className="chips" role="group" aria-label="Status">
        {chips.map((s) => (
          <button
            key={s}
            className="chip"
            aria-pressed={filter.status === s}
            onClick={() => set({ status: s })}
          >
            {s === "All" || s === "Favourites" ? s : STATUS_LABEL[s]}
            <span className="chip-count">{countOf(s)}</span>
          </button>
        ))}
      </div>

      {editing && <p className="hint">Change a status from the menu under each game. It saves straight away.</p>}

      {shown.length === 0 ? (
        <div className="state">
          <h2 className="state-title">No games match</h2>
          <p className="muted">
            {filter.query.trim()
              ? `Nothing called “${filter.query.trim()}” with these filters.`
              : "Nothing in the library fits these filters."}
          </p>
          {filtered && (
            <button className="btn btn-ghost" onClick={() => onFilter({ ...DEFAULT_FILTER, sort: filter.sort })}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="result-count" aria-live="polite">
            {shown.length.toLocaleString()} {shown.length === 1 ? "game" : "games"}
          </p>
          <div className="grid">
            {shown.map((g) => (
              <GameCard key={g.id} game={g} onOpen={onOpen} onStatus={editing ? onQuickStatus : undefined} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
