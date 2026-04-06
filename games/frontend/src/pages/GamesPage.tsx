import { useEffect, useState, useRef } from "react";
import {
  type Game,
  type Platform,
  api,
  type CreateGamePayload,
  type IgdbResult,
  type HardwareType,
} from "../api/client";

interface Props {
  filter: "all" | "favourites" | string;
}

const STATUSES = [
  "Backlog",
  "Playing",
  "Completed",
  "Dropped",
  "OnHold",
] as const;
const MODES = ["Handheld", "TV", "CRT"] as const;
const HARDWARE = ["Original", "Modded", "Emulator", "Cloud"] as const;

export default function GamesPage({ filter }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setFilter] = useState(
    filter === "all" ? "All" : filter === "favourites" ? "Favourites" : filter,
  );
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState<Game | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  useEffect(() => {
    Promise.all([api.getGames(), api.getPlatforms()])
      .then(([g, p]) => {
        setGames(g);
        setPlatforms(p);
      })
      .finally(() => setLoading(false));
  }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const filtered =
    activeFilter === "All"
      ? games
      : activeFilter === "Favourites"
        ? games.filter((g) => g.isFavourite)
        : games.filter((g) =>
            g.userEntries.some((e) => e.status === activeFilter),
          );

  const handleAdd = async (payload: CreateGamePayload) => {
    try {
      const game = await api.createGame(payload);
      setGames((prev) => [...prev, game]);
      setShowAdd(false);
      showToast(`"${game.title}" added`, "success");
    } catch {
      showToast("Failed to add game", "error");
    }
  };

  const handleToggleFavourite = async (id: number) => {
    try {
      const updated = await api.toggleFavourite(id);
      setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
    } catch {
      showToast("Failed to update favourite", "error");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await api.deleteGame(id);
      setGames((prev) => prev.filter((g) => g.id !== id));
      setSelected(null);
      showToast("Game removed", "success");
    } catch {
      showToast("Failed to delete", "error");
    }
  };

  const handleUpdateEntry = async (
    gameId: number,
    entryId: number,
    data: any,
  ) => {
    try {
      const updated = await api.updateEntry(gameId, entryId, data);
      setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
      setSelected((prev) => (prev?.id === updated.id ? updated : prev));
      showToast("Updated", "success");
    } catch {
      showToast("Update failed", "error");
    }
  };

  const handleQuickStatus = async (game: Game, newStatus: string) => {
    const entry = game.userEntries[0];
    if (!entry) return;
    try {
      const updated = await api.updateEntry(game.id, entry.id, {
        status: newStatus,
      });
      setGames((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    } catch {
      showToast("Update failed", "error");
    }
  };

  if (loading) return <div className="loading">LOADING LIBRARY...</div>;

  return (
    <>
      <div className="section">
        <div className="section-header">
          <span className="section-title">Library</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              className={`btn ${editMode ? "btn-primary" : "btn-ghost"}`}
              onClick={() => setEditMode((e) => !e)}
            >
              {editMode ? "✓ Done" : "✎ Edit Mode"}
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setShowAdd(true)}
            >
              + Add Game
            </button>
          </div>
        </div>

        {editMode && (
          <div
            style={{
              background: "var(--blue-glow)",
              border: "1px solid var(--blue-dim)",
              borderRadius: "var(--radius-md)",
              padding: "10px 14px",
              marginBottom: "16px",
              fontFamily: "var(--font-mono)",
              fontSize: "11px",
              color: "var(--blue-bright)",
              letterSpacing: "0.06em",
            }}
          >
            EDIT MODE — Click a status badge on any card to change it instantly
          </div>
        )}

        <div className="filter-bar" style={{ marginBottom: "24px" }}>
          {["All", ...STATUSES].map((s) => (
            <button
              key={s}
              className={`filter-chip ${activeFilter === s ? "active" : ""}`}
              onClick={() => setFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">
            <p>NO GAMES FOUND</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowAdd(true)}
            >
              + Add Game
            </button>
          </div>
        ) : (
          <div className="games-grid">
            {filtered.map((g) => (
              <GameCard
                key={g.id}
                game={g}
                editMode={editMode}
                onClick={() => !editMode && setSelected(g)}
                onQuickStatus={handleQuickStatus}
              />
            ))}
          </div>
        )}
      </div>

      {showAdd && (
        <AddGameModal
          platforms={platforms}
          onAdd={handleAdd}
          onClose={() => setShowAdd(false)}
        />
      )}
      {selected && !editMode && (
        <GameDetailModal
          game={selected}
          platforms={platforms}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
          onUpdateEntry={handleUpdateEntry}
          onToggleFavourite={handleToggleFavourite}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </>
  );
}

function GameCard({
  game,
  editMode,
  onClick,
  onQuickStatus,
}: {
  game: Game;
  editMode: boolean;
  onClick: () => void;
  onQuickStatus: (game: Game, status: string) => void;
}) {
  const entry = game.userEntries[0];
  return (
    <div
      className="game-card"
      onClick={onClick}
      style={{ cursor: editMode ? "default" : "pointer" }}
    >
      {game.coverUrl ? (
        <img src={game.coverUrl} className="game-card-cover" alt={game.title} />
      ) : (
        <div className="game-card-cover-placeholder">🎮</div>
      )}
      <div className="game-card-body">
        <div className="game-card-title">{game.title}</div>
        {entry && (
          <div className="game-card-meta">
            {editMode ? (
              <select
                className="quick-status-select"
                value={entry.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  onQuickStatus(game, e.target.value);
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`status-badge status-${entry.status}`}>
                {entry.status}
              </span>
            )}
            {entry.hoursPlayed ? (
              <span className="game-card-hours">{entry.hoursPlayed}h</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function AddGameModal({
  platforms,
  onAdd,
  onClose,
}: {
  platforms: Platform[];
  onAdd: (p: CreateGamePayload) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IgdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<IgdbResult | null>(null);
  const [platformId, setPlatform] = useState(platforms[0]?.id ?? 1);
  const [genre, setGenre] = useState("");
  const [status, setStatus] = useState("Backlog");
  const [mode, setMode] = useState<string>("");
  const [hardware, setHardware] = useState<string>("Original");
  const [hours, setHours] = useState("");
  const [rating, setRating] = useState("");
  const [notes, setNotes] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearch = (q: string) => {
    setQuery(q);
    setSelected(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        setResults(await api.search(q));
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSelect = (r: IgdbResult) => {
    setSelected(r);
    setQuery(r.name);
    setResults([]);
    if (r.genres[0]) setGenre(r.genres[0]);
    // Auto-match platform by comparing IGDB platform names against our list
    const matched = platforms.find((p) =>
      r.platforms.some(
        (igdbPlat) =>
          igdbPlat.toLowerCase().includes(p.name.toLowerCase()) ||
          p.name.toLowerCase().includes(igdbPlat.toLowerCase()) ||
          (p.abbreviation &&
            igdbPlat.toLowerCase().includes(p.abbreviation.toLowerCase())),
      ),
    );
    if (matched) setPlatform(matched.id);
  };

  const handleSubmit = () => {
    const title = selected?.name ?? query.trim();
    if (!title) return;
    onAdd({
      title,
      coverUrl: selected?.coverUrl ?? undefined,
      genre: genre || selected?.genres[0] || undefined,
      releaseYear: selected?.releaseYear ?? undefined,
      developer: selected?.developers[0] ?? undefined,
      summary: selected?.summary ?? undefined,
      igdbId: selected?.id ?? undefined,
      entry: {
        platformId,
        status,
        mode: mode || undefined,
        hardware,
        hoursPlayed: hours ? parseFloat(hours) : undefined,
        rating: rating ? parseInt(rating) : undefined,
        notes: notes || undefined,
      },
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Add Game</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          {/* IGDB search */}
          <div className="form-group">
            <label className="form-label">Search IGDB</label>
            <input
              className="form-input"
              placeholder="Start typing a game name..."
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searching && (
              <div
                style={{
                  fontSize: "11px",
                  color: "var(--text-faint)",
                  padding: "6px 0",
                  fontFamily: "var(--font-mono)",
                }}
              >
                SEARCHING...
              </div>
            )}
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <div
                    key={r.id}
                    className="search-result-item"
                    onClick={() => handleSelect(r)}
                  >
                    {r.coverUrl ? (
                      <img
                        src={r.coverUrl}
                        className="search-result-cover"
                        alt={r.name}
                      />
                    ) : (
                      <div className="search-result-cover" />
                    )}
                    <div className="search-result-info">
                      <div className="search-result-name">{r.name}</div>
                      <div className="search-result-meta">
                        {r.releaseYear && <span>{r.releaseYear}</span>}
                        {r.developers[0] && <span> · {r.developers[0]}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div
              style={{
                display: "flex",
                gap: "12px",
                marginBottom: "16px",
                padding: "12px",
                background: "var(--surface)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-2)",
              }}
            >
              {selected.coverUrl && (
                <img
                  src={selected.coverUrl}
                  style={{
                    width: "48px",
                    height: "64px",
                    objectFit: "cover",
                    borderRadius: "3px",
                  }}
                  alt={selected.name}
                />
              )}
              <div>
                <div style={{ fontWeight: 600, marginBottom: "4px" }}>
                  {selected.name}
                </div>
                <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {selected.releaseYear} · {selected.genres.join(", ")}
                </div>
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--blue)",
                    marginTop: "2px",
                    fontFamily: "var(--font-mono)",
                  }}
                >
                  ✓ IGDB data loaded
                </div>
              </div>
            </div>
          )}

          {/* Platform & Status */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div className="form-group">
              <label className="form-label">Platform</label>
              <select
                className="form-select"
                value={platformId}
                onChange={(e) => setPlatform(Number(e.target.value))}
              >
                {platforms.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-select"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Genre */}
          <div className="form-group">
            <label className="form-label">Genre</label>
            <input
              className="form-input"
              placeholder="e.g. RPG, Action, Platformer"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
            />
          </div>

          {/* Mode & Hardware */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div className="form-group">
              <label className="form-label">Play Mode</label>
              <select
                className="form-select"
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="">— Not specified</option>
                {MODES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Hardware</label>
              <select
                className="form-select"
                value={hardware}
                onChange={(e) => setHardware(e.target.value)}
              >
                {HARDWARE.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Hours & Rating */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
            }}
          >
            <div className="form-group">
              <label className="form-label">Hours Played</label>
              <input
                className="form-input"
                type="number"
                min="0"
                step="0.5"
                placeholder="0"
                value={hours}
                onChange={(e) => setHours(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Rating (1–10)</label>
              <input
                className="form-input"
                type="number"
                min="1"
                max="10"
                placeholder="—"
                value={rating}
                onChange={(e) => setRating(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea
              className="form-textarea"
              placeholder="Your thoughts..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!query.trim() && !selected}
            >
              Add Game
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function GameDetailModal({
  game,
  platforms,
  onClose,
  onDelete,
  onUpdateEntry,
  onToggleFavourite,
}: {
  game: Game;
  platforms: Platform[];
  onClose: () => void;
  onDelete: (id: number) => void;
  onUpdateEntry: (gameId: number, entryId: number, data: any) => void;
  onToggleFavourite: (id: number) => void;
}) {
  const entry = game.userEntries[0];
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(entry?.status ?? "Backlog");
  const [mode, setMode] = useState(entry?.mode ?? "");
  const [hardware, setHardware] = useState(entry?.hardware ?? "Original");
  const [hours, setHours] = useState(String(entry?.hoursPlayed ?? ""));
  const [rating, setRating] = useState(String(entry?.rating ?? ""));
  const [notes, setNotes] = useState(entry?.notes ?? "");

  const handleSave = () => {
    if (!entry) return;
    onUpdateEntry(game.id, entry.id, {
      status,
      mode: mode || undefined,
      hardware,
      hoursPlayed: hours ? parseFloat(hours) : undefined,
      rating: rating ? parseInt(rating) : undefined,
      notes: notes || undefined,
    });
    setEditing(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{game.title}</span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <button
              className="btn btn-ghost"
              onClick={() => onToggleFavourite(game.id)}
              style={{
                padding: "4px 8px",
                color: game.isFavourite ? "var(--orange)" : "var(--text-faint)",
                fontSize: "16px",
              }}
              title={game.isFavourite ? "Remove from favourites" : "Add to favourites"}
            >
              {game.isFavourite ? "★" : "☆"}
            </button>
            <button className="modal-close" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>
        <div className="modal-body">
          {/* Cover + meta */}
          <div style={{ display: "flex", gap: "16px", marginBottom: "20px" }}>
            {game.coverUrl && (
              <img
                src={game.coverUrl}
                style={{
                  width: "80px",
                  height: "106px",
                  objectFit: "cover",
                  borderRadius: "4px",
                  flexShrink: 0,
                }}
                alt={game.title}
              />
            )}
            <div>
              {game.developer && (
                <div
                  style={{
                    fontSize: "13px",
                    color: "var(--text-muted)",
                    marginBottom: "4px",
                  }}
                >
                  {game.developer}
                </div>
              )}
              {game.releaseYear && (
                <div
                  style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: "12px",
                    color: "var(--text-faint)",
                    marginBottom: "8px",
                  }}
                >
                  {game.releaseYear}
                </div>
              )}
              {game.genre && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "var(--text-faint)",
                    marginBottom: "8px",
                  }}
                >
                  {game.genre}
                </div>
              )}
              {entry && (
                <div
                  style={{
                    display: "flex",
                    gap: "6px",
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <span className={`status-badge status-${entry.status}`}>
                    {entry.status}
                  </span>
                  {entry.hoursPlayed && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--text-muted)",
                      }}
                    >
                      {entry.hoursPlayed}h
                    </span>
                  )}
                  {entry.rating && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--blue-bright)",
                      }}
                    >
                      ★ {entry.rating}/10
                    </span>
                  )}
                  {entry.mode && (
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        color: "var(--text-faint)",
                        textTransform: "uppercase",
                      }}
                    >
                      {entry.mode}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color:
                        entry.hardware === "Modded"
                          ? "var(--orange)"
                          : "var(--text-faint)",
                      textTransform: "uppercase",
                    }}
                  >
                    {entry.hardware}
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      color: "var(--text-faint)",
                      textTransform: "uppercase",
                    }}
                  >
                    {entry.source}
                  </span>
                </div>
              )}
            </div>
          </div>

          {game.summary && (
            <p
              style={{
                fontSize: "13px",
                color: "var(--text-muted)",
                marginBottom: "20px",
                lineHeight: "1.6",
              }}
            >
              {game.summary}
            </p>
          )}

          {entry && editing ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div className="form-group">
                  <label className="form-label">Status</label>
                  <select
                    className="form-select"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                  >
                    {STATUSES.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Hours</label>
                  <input
                    className="form-input"
                    type="number"
                    min="0"
                    step="0.5"
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "12px",
                }}
              >
                <div className="form-group">
                  <label className="form-label">Play Mode</label>
                  <select
                    className="form-select"
                    value={mode}
                    onChange={(e) => setMode(e.target.value)}
                  >
                    <option value="">— Not specified</option>
                    {MODES.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Hardware</label>
                  <select
                    className="form-select"
                    value={hardware}
                    onChange={(e) =>
                      setHardware(e.target.value as HardwareType)
                    }
                  >
                    {HARDWARE.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Rating (1–10)</label>
                <input
                  className="form-input"
                  type="number"
                  min="1"
                  max="10"
                  value={rating}
                  onChange={(e) => setRating(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea
                  className="form-textarea"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditing(false)}
                >
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave}>
                  Save
                </button>
              </div>
            </>
          ) : (
            <>
              {entry?.notes && (
                <div
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-md)",
                    padding: "12px 14px",
                    marginBottom: "16px",
                    fontSize: "13px",
                    color: "var(--text-muted)",
                  }}
                >
                  {entry.notes}
                </div>
              )}
              {entry?.achievementsEarned != null &&
                entry.achievementsTotal != null && (
                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginBottom: "16px",
                    }}
                  >
                    ACHIEVEMENTS: {entry.achievementsEarned} /{" "}
                    {entry.achievementsTotal}
                  </div>
                )}
              <div className="btn-row">
                <button
                  className="btn btn-danger"
                  onClick={() => onDelete(game.id)}
                >
                  Delete
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => setEditing(true)}
                >
                  Edit Entry
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
