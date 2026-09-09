import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type {
  Game,
  GameListItem,
  GameQueryParams,
  Platform,
  PlayStatus,
} from "../api/client";
import type { RouteParams } from "../hooks/useHashRoute";
import { useToast } from "../hooks/toast";
import GameCard from "../components/GameCard";
import AddGameModal from "../components/AddGameModal";
import GameDetailModal from "../components/GameDetailModal";
import Modal from "../components/Modal";
import { STATUSES, primaryEntry, statusLabel } from "../lib/game";
import { existingEntryToPayload } from "../lib/entry";
import { downloadCsv, gamesToCsv } from "../lib/export";

const PAGE_SIZE = 60;
const EXPORT_PAGE_SIZE = 200;
const EXPORT_PAGE_LIMIT = 25;
const SEARCH_DEBOUNCE_MS = 350;

type SortOption = NonNullable<GameQueryParams["sort"]>;

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "title", label: "Title A–Z" },
  { value: "-title", label: "Title Z–A" },
  { value: "added", label: "Recently added" },
  { value: "played", label: "Recently played" },
  { value: "hours", label: "Most hours" },
  { value: "rating", label: "Highest rated" },
  { value: "year", label: "Newest release" },
];

interface Props {
  /** The route's query string — the single source of truth for the filters. */
  search: string;
  isLoggedIn: boolean;
  onLoginRequest: () => void;
  onNavigate: (path: string, params?: RouteParams) => void;
}

interface Filters {
  q: string;
  status: PlayStatus | "";
  platformId?: number;
  favourite: boolean;
  sort: SortOption;
  gameId?: number;
}

function parseFilters(search: string): Filters {
  const params = new URLSearchParams(search);
  const status = params.get("status") ?? "";
  const sort = params.get("sort") ?? "title";
  const gameId = Number(params.get("game"));

  return {
    q: params.get("q") ?? "",
    status: STATUSES.includes(status as PlayStatus) ? (status as PlayStatus) : "",
    platformId: Number(params.get("platform")) || undefined,
    favourite: params.get("favourite") === "1",
    sort: SORT_OPTIONS.some((option) => option.value === sort)
      ? (sort as SortOption)
      : "title",
    gameId: Number.isInteger(gameId) && gameId > 0 ? gameId : undefined,
  };
}

export default function GamesPage({
  search,
  isLoggedIn,
  onLoginRequest,
  onNavigate,
}: Props) {
  const { showToast } = useToast();
  const filters = useMemo(() => parseFilters(search), [search]);

  // The query key deliberately excludes `game`, so opening the detail dialog
  // does not refetch the grid behind it.
  const queryKey = useMemo(() => {
    const params = new URLSearchParams(search);
    params.delete("game");
    return params.toString();
  }, [search]);

  const [games, setGames] = useState<GameListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Paging is stored with the query it belongs to, so a filter change resets
  // to page 1 within the same render instead of firing a throwaway request.
  const [paging, setPaging] = useState({ key: queryKey, page: 1 });
  const page = paging.key === queryKey ? paging.page : 1;

  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [editMode, setEditMode] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showPermissionDenied, setShowPermissionDenied] = useState(false);
  const [exporting, setExporting] = useState(false);

  const searchInput = useRef<HTMLInputElement>(null);

  const setFilter = useCallback(
    (changes: Record<string, string | undefined>) => {
      const params = new URLSearchParams(search);

      for (const [key, value] of Object.entries(changes)) {
        if (value === undefined || value === "") params.delete(key);
        else params.set(key, value);
      }

      onNavigate("/library", Object.fromEntries(params));
    },
    [search, onNavigate],
  );

  // --- Data ---------------------------------------------------------------

  useEffect(() => {
    const controller = new AbortController();

    api
      .getPlatforms(controller.signal)
      .then(setPlatforms)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        // Not fatal: only the add/edit dropdowns need it.
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    api
      .getGames(
        {
          q: filters.q || undefined,
          status: filters.status || undefined,
          platformId: filters.platformId,
          favourite: filters.favourite || undefined,
          sort: filters.sort,
          page,
          pageSize: PAGE_SIZE,
        },
        controller.signal,
      )
      .then((result) => {
        setGames((current) =>
          result.page === 1 ? result.items : [...current, ...result.items],
        );
        setTotal(result.totalCount);
        setHasMore(result.hasMore);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLoading(false);
        setError(
          cause instanceof ApiError ? cause.message : "Could not load the library.",
        );
      });

    return () => controller.abort();
    // filters is derived from `search`; queryKey covers everything that
    // changes the result set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey, page, reloadKey]);

  // --- Keyboard -----------------------------------------------------------

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      event.preventDefault();
      searchInput.current?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // --- Mutations ----------------------------------------------------------

  const replaceGame = useCallback(
    (updated: Game) => {
      setGames((current) => {
        // Un-favouriting while the favourites filter is on should drop it.
        if (filters.favourite && !updated.isFavourite) {
          return current.filter((game) => game.id !== updated.id);
        }
        return current.map((game) => (game.id === updated.id ? updated : game));
      });
    },
    [filters.favourite],
  );

  const removeGame = useCallback((gameId: number) => {
    setGames((current) => current.filter((game) => game.id !== gameId));
    setTotal((current) => Math.max(current - 1, 0));
  }, []);

  const requireAuth = (action: () => void) => {
    if (!isLoggedIn) {
      setShowPermissionDenied(true);
      return;
    }
    action();
  };

  const handleQuickStatus = async (game: GameListItem, status: PlayStatus) => {
    const entry = primaryEntry(game);
    if (!entry) return;

    try {
      replaceGame(
        await api.updateEntry(
          game.id,
          entry.id,
          existingEntryToPayload(entry, { status }),
        ),
      );
    } catch (cause) {
      showToast(
        cause instanceof ApiError ? cause.message : "Update failed.",
        "error",
      );
    }
  };

  const handleToggleFavourite = async (game: GameListItem) => {
    try {
      replaceGame(await api.toggleFavourite(game.id));
    } catch (cause) {
      showToast(
        cause instanceof ApiError ? cause.message : "Update failed.",
        "error",
      );
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const collected: GameListItem[] = [];

      for (let current = 1; current <= EXPORT_PAGE_LIMIT; current++) {
        const result = await api.getGames({
          q: filters.q || undefined,
          status: filters.status || undefined,
          platformId: filters.platformId,
          favourite: filters.favourite || undefined,
          sort: filters.sort,
          page: current,
          pageSize: EXPORT_PAGE_SIZE,
        });

        collected.push(...result.items);
        if (!result.hasMore) break;
      }

      downloadCsv(
        `gamelog-${new Date().toISOString().slice(0, 10)}.csv`,
        gamesToCsv(collected),
      );
      showToast(`Exported ${collected.length} games`, "success");
    } catch (cause) {
      showToast(
        cause instanceof ApiError ? cause.message : "Export failed.",
        "error",
      );
    } finally {
      setExporting(false);
    }
  };

  // --- Render -------------------------------------------------------------

  const selectedGame = filters.gameId
    ? games.find((game) => game.id === filters.gameId)
    : undefined;

  const showingLabel = total === 1 ? "1 game" : `${total} games`;

  return (
    <>
      <div className="section">
        <div className="section-header">
          <h2 className="section-title">Library</h2>

          <div className="section-actions">
            {isLoggedIn && (
              <button
                type="button"
                className={`btn ${editMode ? "btn-primary" : "btn-ghost"}`}
                aria-pressed={editMode}
                onClick={() => setEditMode((current) => !current)}
              >
                {editMode ? "✓ Done" : "✎ Edit Mode"}
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleExport}
              disabled={exporting || total === 0}
            >
              {exporting ? "Exporting…" : "↓ Export CSV"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => requireAuth(() => setShowAdd(true))}
            >
              + Add Game
            </button>
          </div>
        </div>

        {editMode && isLoggedIn && (
          <p className="notice notice-edit">
            EDIT MODE — change a status straight from any card
          </p>
        )}

        {!isLoggedIn && (
          <p className="notice">
            <span>👁 Viewing as guest — read only</span>
            <button type="button" className="link-btn" onClick={onLoginRequest}>
              Log in →
            </button>
          </p>
        )}

        <SearchBar
          value={filters.q}
          inputRef={searchInput}
          onChange={(value) => setFilter({ q: value || undefined })}
        />

        <div className="filter-bar" role="group" aria-label="Filter by status">
          <button
            type="button"
            className={`filter-chip ${!filters.status && !filters.favourite ? "active" : ""}`}
            aria-pressed={!filters.status && !filters.favourite}
            onClick={() => setFilter({ status: undefined, favourite: undefined })}
          >
            All
          </button>

          {STATUSES.map((status) => (
            <button
              key={status}
              type="button"
              className={`filter-chip ${filters.status === status ? "active" : ""}`}
              aria-pressed={filters.status === status}
              onClick={() =>
                setFilter({
                  status: filters.status === status ? undefined : status,
                  favourite: undefined,
                })
              }
            >
              {statusLabel(status)}
            </button>
          ))}

          <button
            type="button"
            className={`filter-chip ${filters.favourite ? "active" : ""}`}
            aria-pressed={filters.favourite}
            onClick={() =>
              setFilter({
                favourite: filters.favourite ? undefined : "1",
                status: undefined,
              })
            }
          >
            ★ Favourites
          </button>
        </div>

        <div className="list-toolbar">
          <div className="list-toolbar-controls">
            <label className="visually-hidden" htmlFor="platform-filter">
              Filter by platform
            </label>
            <select
              id="platform-filter"
              className="form-select form-select-inline"
              value={filters.platformId ?? ""}
              onChange={(event) =>
                setFilter({ platform: event.target.value || undefined })
              }
            >
              <option value="">All platforms</option>
              {platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>

            <label className="visually-hidden" htmlFor="sort-order">
              Sort order
            </label>
            <select
              id="sort-order"
              className="form-select form-select-inline"
              value={filters.sort}
              onChange={(event) => setFilter({ sort: event.target.value })}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <span className="list-count" aria-live="polite">
            {loading && games.length === 0 ? "Loading…" : showingLabel}
          </span>
        </div>

        {error ? (
          <div className="empty-state">
            <p>{error}</p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setReloadKey((key) => key + 1)}
            >
              Try again
            </button>
          </div>
        ) : loading && games.length === 0 ? (
          <div className="games-grid" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => (
              <div className="game-card skeleton" key={index} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div className="empty-state">
            <p>NO GAMES FOUND</p>
            {(filters.q || filters.status || filters.platformId || filters.favourite) && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => onNavigate("/library")}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className={`games-grid${loading ? " is-loading" : ""}`}>
              {games.map((game, index) => (
                <GameCard
                  key={game.id}
                  game={game}
                  editMode={editMode && isLoggedIn}
                  canFavourite={isLoggedIn}
                  eagerCover={index < 6}
                  onOpen={() => setFilter({ game: String(game.id) })}
                  onQuickStatus={handleQuickStatus}
                  onToggleFavourite={handleToggleFavourite}
                />
              ))}
            </div>

            {hasMore && (
              <div className="load-more">
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={loading}
                  onClick={() =>
                    setPaging({ key: queryKey, page: page + 1 })
                  }
                >
                  {loading ? "Loading…" : `Load more (${games.length} of ${total})`}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {showAdd && isLoggedIn && (
        <AddGameModal
          platforms={platforms}
          onClose={() => setShowAdd(false)}
          onCreated={(game) => {
            setShowAdd(false);
            setReloadKey((key) => key + 1);
            showToast(`"${game.title}" added`, "success");
          }}
          onOpenExisting={(gameId) => {
            setShowAdd(false);
            setFilter({ game: String(gameId) });
          }}
        />
      )}

      {filters.gameId && (
        <GameDetailModal
          gameId={filters.gameId}
          initial={selectedGame}
          platforms={platforms}
          isLoggedIn={isLoggedIn}
          onClose={() => setFilter({ game: undefined })}
          onChanged={replaceGame}
          onDeleted={(gameId) => {
            removeGame(gameId);
            showToast("Game removed", "success");
          }}
          onLoginRequest={() => {
            setFilter({ game: undefined });
            onLoginRequest();
          }}
        />
      )}

      {showPermissionDenied && (
        <Modal
          title="Access Restricted"
          maxWidth="380px"
          onClose={() => setShowPermissionDenied(false)}
        >
          <div className="locked-state">
            <div className="locked-icon" aria-hidden="true">
              🔒
            </div>
            <p>Sorry, you don't have permission to do that.</p>
            <p className="locked-note">
              This library belongs to Dimitri. Log in as admin to make changes.
            </p>
          </div>
          <div className="btn-row btn-row-center">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setShowPermissionDenied(false)}
            >
              Close
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setShowPermissionDenied(false);
                onLoginRequest();
              }}
            >
              Log In
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function SearchBar({
  value,
  inputRef,
  onChange,
}: {
  value: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
}) {
  const [text, setText] = useState(value);
  const [syncedValue, setSyncedValue] = useState(value);

  // Adjusting state during render is React's own answer to "reset when a prop
  // changes": it keeps the box in step with the URL after a back button or a
  // "clear filters" click, with no extra pass over the DOM.
  if (value !== syncedValue) {
    setSyncedValue(value);
    setText(value);
  }

  // Debounced: typing does not push a URL entry or a request per keystroke.
  useEffect(() => {
    if (text === value) return;

    const timer = setTimeout(() => onChange(text), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value, onChange]);

  return (
    <div className="search-bar">
      <label className="visually-hidden" htmlFor="library-search">
        Search the library
      </label>
      <input
        id="library-search"
        ref={inputRef}
        className="form-input"
        type="search"
        placeholder="Search titles and developers…  (press / )"
        value={text}
        autoComplete="off"
        onChange={(event) => setText(event.target.value)}
      />
      {text && (
        <button
          type="button"
          className="search-clear"
          aria-label="Clear search"
          onClick={() => setText("")}
        >
          ✕
        </button>
      )}
    </div>
  );
}
