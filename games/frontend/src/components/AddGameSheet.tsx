import { useEffect, useRef, useState } from "react";
import { api, type CreateGamePayload, type IgdbResult, type Platform } from "../api/client";
import { useEscape } from "../hooks/useEscape";
import { draftError, type EntryDraft } from "../lib/games";
import EntryFields from "./EntryFields";
import SheetHeader from "./SheetHeader";

export default function AddGameSheet({
  platforms,
  onAdd,
  onClose,
}: {
  platforms: Platform[];
  onAdd: (p: CreateGamePayload) => Promise<boolean>;
  onClose: () => void;
}) {
  useEscape(onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IgdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<IgdbResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>({
    // Platforms arrive sorted by name (Game Boy first), so default to PC
    platformId: platforms.find((p) => p.name === "PC")?.id ?? platforms[0]?.id ?? 1,
    status: "Backlog",
    mode: "",
    hardware: "Original",
    hours: "",
    rating: "",
    notes: "",
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleSearch = (q: string) => {
    setQuery(q);
    setSelected(null);
    clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      try {
        setResults(await api.search(q.trim()));
      } catch {
        setResults([]); // search is a convenience; manual title entry still works
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleSelect = (r: IgdbResult) => {
    setSelected(r);
    setQuery(r.name);
    setResults([]);
  };

  const title = selected?.name ?? query.trim();
  const canAdd = !!title && !draftError(draft) && !saving;

  const handleSubmit = async () => {
    if (!canAdd) return;
    setSaving(true);
    const ok = await onAdd({
      title,
      coverUrl: selected?.coverUrl ?? undefined,
      genre: selected?.genres[0],
      releaseYear: selected?.releaseYear ?? undefined,
      developer: selected?.developers[0],
      summary: selected?.summary ?? undefined,
      igdbId: selected?.id,
      entry: {
        platformId: draft.platformId,
        status: draft.status,
        mode: draft.mode || undefined,
        hardware: draft.hardware,
        hoursPlayed: draft.hours ? Number(draft.hours) : undefined,
        rating: draft.rating ? Number(draft.rating) : undefined,
        notes: draft.notes.trim() || undefined,
      },
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-label="Add Game">
        <SheetHeader
          title="Add Game"
          onCancel={onClose}
          confirmLabel={saving ? "Adding…" : "Add"}
          onConfirm={handleSubmit}
          confirmDisabled={!canAdd}
        />
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label" htmlFor="f-search">
              Search IGDB
            </label>
            <input
              id="f-search"
              className="form-input"
              placeholder="Start typing a game name..."
              type="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              autoFocus
            />
            {searching && <div className="form-hint">SEARCHING...</div>}
            {!searching && query.trim().length >= 2 && !selected && results.length === 0 && (
              <div className="form-hint">No IGDB match. You can still add it with this title.</div>
            )}
            {results.length > 0 && (
              <div className="search-results">
                {results.map((r) => (
                  <button key={r.id} className="search-result-item" onClick={() => handleSelect(r)}>
                    {r.coverUrl ? (
                      <img src={r.coverUrl} className="search-result-cover" alt="" />
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
                  </button>
                ))}
              </div>
            )}
          </div>

          {selected && (
            <div className="selected-game">
              {selected.coverUrl && <img src={selected.coverUrl} alt="" />}
              <div>
                <div className="selected-game-name">{selected.name}</div>
                <div className="selected-game-meta">
                  {[selected.releaseYear, selected.genres.join(", ")].filter(Boolean).join(" · ")}
                </div>
                <div className="selected-game-note">✓ IGDB data loaded</div>
              </div>
            </div>
          )}

          <EntryFields draft={draft} onChange={setDraft} platforms={platforms} />

          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={!canAdd}>
              {saving ? "Adding..." : "Add Game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
