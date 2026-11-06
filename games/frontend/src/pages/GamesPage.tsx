import { useState, type RefObject } from "react";
import type { Game, Platform, PlayStatus } from "../api/client";
import Cover from "../components/Cover";
import GameCard from "../components/GameCard";
import type { Library } from "../hooks/useLibrary";
import {
  HARDWARE,
  SORTS,
  STATUSES,
  STATUS_LABEL,
  entryOf,
  fmtDate,
  fmtHours,
  lastPlayed,
  matches,
  playtimeTotal,
  sortGames,
  totalHours,
  type LibraryFilter,
  type SortKey,
  type StatusFilter,
} from "../lib/games";

interface Props {
  games: Game[];
  platforms: Platform[];
  filter: LibraryFilter;
  base: LibraryFilter; // this page's defaults, for "Clear filters"
  onFilter: (f: LibraryFilter) => void;
  isLoggedIn: boolean;
  lib: Library;
  searchRef: RefObject<HTMLInputElement | null>;
  onOpen: (g: Game) => void;
  onAdd: () => void;
  onPick?: () => void;
  onLoginRequest: () => void;
}

type View = "grid" | "list";
const VIEW_KEY = "gamelog_view";
const savedView = (): View => {
  try {
    return localStorage.getItem(VIEW_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
};

export default function GamesPage({
  games,
  platforms,
  filter,
  base,
  onFilter,
  isLoggedIn,
  lib,
  searchRef,
  onOpen,
  onAdd,
  onPick,
  onLoginRequest,
}: Props) {
  const [editMode, setEditMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [view, setView] = useState<View>(savedView);
  const extraCount = [filter.genre, filter.hardware, filter.decade].filter((v) => v !== null).length;
  const [showMore, setShowMore] = useState(extraCount > 0);
  const set = (patch: Partial<LibraryFilter>) => onFilter({ ...filter, ...patch });
  const editing = editMode && isLoggedIn;

  // Chip counts respect every other filter, so they match what you'll see
  const countOf = (s: StatusFilter) => games.filter((g) => matches(g, { ...filter, status: s })).length;
  const chips = (["All", ...STATUSES, "Favourites", "Hidden"] as StatusFilter[]).filter((s) => {
    if (s === filter.status) return true;
    if (s === "Hidden") return isLoggedIn && countOf(s) > 0;
    if (s === "Favourites" || s === "Wishlist") return countOf(s) > 0;
    return true;
  });

  const shown = sortGames(
    games.filter((g) => matches(g, filter)),
    filter.sort,
  );
  const toBeat = filter.status === "Backlog" ? playtimeTotal(shown) : 0;

  // Only platforms that have games, with counts
  const usedPlatforms = platforms
    .map((p) => ({ ...p, n: games.filter((g) => !g.isHidden && g.userEntries.some((e) => e.platformId === p.id)).length }))
    .filter((p) => p.n > 0 || p.id === filter.platformId);
  const genres = [...new Set(games.map((g) => g.genre).filter((x): x is string => !!x))].sort();
  const decades = [...new Set(games.map((g) => g.releaseYear && Math.floor(g.releaseYear / 10) * 10).filter((x): x is number => !!x))].sort();

  const filtered =
    filter.status !== base.status ||
    filter.platformId !== null ||
    extraCount > 0 ||
    filter.query.trim() !== "";

  const chooseView = (v: View) => {
    setView(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      // per-device preference only
    }
  };

  const toggle = (g: Game) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(g.id)) next.delete(g.id);
      else next.add(g.id);
      return next;
    });
  const open = editing ? toggle : onOpen;
  const picked = shown.filter((g) => selected.has(g.id));
  const quickStatus = (g: Game, s: PlayStatus) => lib.setStatus([g], s);
  const stopEditing = () => {
    setEditMode(false);
    setSelected(new Set());
  };

  return (
    <div className="section">
      <div className="section-header">
        <span className="section-title desktop-only">Library</span>
        <div className="section-actions">
          {onPick && (
            <button className="btn btn-ghost" onClick={onPick}>
              🎲 What should I play?
            </button>
          )}
          {isLoggedIn && (
            <>
              <button className={`btn ${editMode ? "btn-primary" : "btn-ghost"}`} onClick={editMode ? stopEditing : () => setEditMode(true)}>
                {editMode ? "✓ Done" : "✎ Edit Mode"}
              </button>
              <button className="btn btn-primary" onClick={onAdd}>
                + Add Game
              </button>
            </>
          )}
        </div>
      </div>

      {editing && (
        <div className="notice notice-edit">
          EDIT MODE: Tap games to select them, then change them together below. Each card's menu changes just that game.
        </div>
      )}

      {!isLoggedIn && (
        <div className="notice">
          <span>👁 Viewing as guest: read only</span>
          <button className="notice-link" onClick={onLoginRequest}>
            Log in →
          </button>
        </div>
      )}

      <div className="library-toolbar">
        <input
          ref={searchRef}
          className="form-input library-search"
          type="search"
          enterKeyHint="search"
          autoCorrect="off"
          autoCapitalize="off"
          aria-label="Search games"
          placeholder="Search titles, developers, genres... ( / )"
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
        <select className="form-select" aria-label="Sort by" value={filter.sort} onChange={(e) => set({ sort: e.target.value as SortKey })}>
          {Object.entries(SORTS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <div className="toolbar-buttons">
          <button
            className={`btn btn-ghost ${showMore ? "active" : ""}`}
            aria-expanded={showMore}
            onClick={() => setShowMore((s) => !s)}
          >
            Filters{extraCount > 0 && <span className="chip-count">{extraCount}</span>}
          </button>
          <div className="view-toggle" role="group" aria-label="View">
            <button className={view === "grid" ? "active" : ""} aria-pressed={view === "grid"} onClick={() => chooseView("grid")} aria-label="Grid view">
              ▦
            </button>
            <button className={view === "list" ? "active" : ""} aria-pressed={view === "list"} onClick={() => chooseView("list")} aria-label="List view">
              ☰
            </button>
          </div>
        </div>
      </div>

      {showMore && (
        <div className="library-toolbar more-filters">
          <select className="form-select" aria-label="Genre" value={filter.genre ?? ""} onChange={(e) => set({ genre: e.target.value || null })}>
            <option value="">Any genre</option>
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
          <select className="form-select" aria-label="Hardware" value={filter.hardware ?? ""} onChange={(e) => set({ hardware: e.target.value || null })}>
            <option value="">Any hardware</option>
            {HARDWARE.map((h) => (
              <option key={h}>{h}</option>
            ))}
          </select>
          <select
            className="form-select"
            aria-label="Decade"
            value={filter.decade ?? ""}
            onChange={(e) => set({ decade: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">Any decade</option>
            {decades.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="filter-bar" role="group" aria-label="Status">
        {chips.map((s) => (
          <button
            key={s}
            className={`filter-chip ${filter.status === s ? "active" : ""}`}
            aria-pressed={filter.status === s}
            onClick={() => set({ status: s })}
          >
            {s === "Favourites" ? "★ Favourites" : s === "All" || s === "Hidden" ? s : STATUS_LABEL[s]}
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
            <button className="btn btn-ghost" onClick={() => onFilter({ ...base, sort: filter.sort })}>
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="result-count" aria-live="polite">
            {shown.length} {shown.length === 1 ? "GAME" : "GAMES"}
            {toBeat > 0 && ` · ABOUT ${Math.round(toBeat).toLocaleString()}H TO BEAT`}
          </div>
          {view === "grid" ? (
            <div className="games-grid">
              {shown.map((g) => (
                <GameCard
                  key={g.id}
                  game={g}
                  onOpen={open}
                  onStatus={editing ? quickStatus : undefined}
                  selected={editing ? selected.has(g.id) : undefined}
                />
              ))}
            </div>
          ) : (
            <GameTable games={shown} sort={filter.sort} onSort={(sort) => set({ sort })} onOpen={open} selected={editing ? selected : undefined} />
          )}
        </>
      )}

      {editing && (
        <BulkBar
          picked={picked}
          shown={shown}
          platforms={platforms}
          showingHidden={filter.status === "Hidden"}
          lib={lib}
          onSelect={(ids) => setSelected(new Set(ids))}
        />
      )}
    </div>
  );
}

// Dense, sortable list; columns collapse on phones
function GameTable({
  games,
  sort,
  onSort,
  onOpen,
  selected,
}: {
  games: Game[];
  sort: SortKey;
  onSort: (s: SortKey) => void;
  onOpen: (g: Game) => void;
  selected?: Set<number>;
}) {
  const th = (label: string, key: SortKey | null, cls = "") => (
    <th className={cls} aria-sort={key && sort === key ? "descending" : undefined}>
      {key ? (
        <button className={sort === key ? "active" : ""} onClick={() => onSort(key)}>
          {label}
        </button>
      ) : (
        label
      )}
    </th>
  );
  return (
    <table className="game-table">
      <thead>
        <tr>
          {th("Title", "title", "col-title")}
          {th("Platform", null, "col-wide")}
          {th("Status", null)}
          {th("Hours", "hours", "col-num")}
          {th("Rating", "rating", "col-num col-wide")}
          {th("Last played", "recent", "col-wide")}
        </tr>
      </thead>
      <tbody>
        {games.map((g) => {
          const e = entryOf(g);
          const isSel = selected?.has(g.id);
          const played = lastPlayed(g);
          return (
            <tr
              key={g.id}
              tabIndex={0}
              className={isSel ? "selected" : ""}
              aria-selected={selected ? isSel : undefined}
              onClick={() => onOpen(g)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  onOpen(g);
                }
              }}
            >
              <td className="col-title">
                <span className="row-title">
                  {selected && <span className="select-mark">{isSel ? "✓" : ""}</span>}
                  <Cover src={g.coverUrl} className="row-cover" />
                  <span>
                    <span className="row-name">
                      {g.isFavourite && <span className="row-fav">★ </span>}
                      {g.title}
                    </span>
                    <span className="row-sub">{[g.developer, g.releaseYear].filter(Boolean).join(" · ")}</span>
                  </span>
                </span>
              </td>
              <td className="col-wide">{g.userEntries.map((x) => x.platformName).join(", ")}</td>
              <td>{e && <span className={`status-badge status-${e.status}`}>{STATUS_LABEL[e.status]}</span>}</td>
              <td className="col-num">{fmtHours(totalHours(g))}</td>
              <td className="col-num col-wide">{e?.rating ? `${e.rating}/10` : ""}</td>
              <td className="col-wide">{played ? fmtDate(new Date(played).toISOString()) : "Never"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BulkBar({
  picked,
  shown,
  platforms,
  showingHidden,
  lib,
  onSelect,
}: {
  picked: Game[];
  shown: Game[];
  platforms: Platform[];
  showingHidden: boolean;
  lib: Library;
  onSelect: (ids: number[]) => void;
}) {
  const n = picked.length;
  const done = (ok: boolean) => ok && onSelect([]);
  return (
    <div className="bulk-bar" role="toolbar" aria-label="Change selected games">
      <span className="bulk-count">{n} selected</span>
      {n < shown.length ? (
        <button className="btn btn-ghost" onClick={() => onSelect(shown.map((g) => g.id))}>
          Select all {shown.length}
        </button>
      ) : (
        <button className="btn btn-ghost" onClick={() => onSelect([])}>
          Clear
        </button>
      )}
      <select
        className="form-select"
        aria-label="Set status"
        value=""
        disabled={!n}
        onChange={async (e) => done(await lib.setStatus(picked, e.target.value as PlayStatus))}
      >
        <option value="">Status…</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </select>
      <select
        className="form-select"
        aria-label="Set platform"
        value=""
        disabled={!n}
        onChange={async (e) => done(await lib.setPlatform(picked, Number(e.target.value)))}
      >
        <option value="">Platform…</option>
        {platforms.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button className={`btn ${showingHidden ? "btn-ghost" : "btn-danger"}`} disabled={!n} onClick={async () => done(await lib.setHidden(picked, !showingHidden))}>
        {showingHidden ? "Unhide" : "Hide"}
      </button>
    </div>
  );
}
