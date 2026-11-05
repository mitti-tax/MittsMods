import { useEffect, useRef, useState } from "react";
import { api, type CreateGamePayload, type IgdbResult } from "../api/client";
import { useEscape } from "../hooks/useEscape";
import { draftError, type EntryDraft } from "../lib/games";
import EntryFields from "./EntryFields";
import SheetHeader from "./SheetHeader";

export default function AddGameSheet({
  onAdd,
  onClose,
}: {
  onAdd: (p: CreateGamePayload) => Promise<boolean>;
  onClose: () => void;
}) {
  useEscape(onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IgdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<IgdbResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>({
    platformId: 1,
    status: "Backlog",
    mode: "",
    hardware: "Original",
    hours: "",
    rating: "",
    notes: "",
  });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const search = (q: string) => {
    setQuery(q);
    setPicked(null);
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
        setResults([]); // search is a convenience; a typed title still works
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const pick = (r: IgdbResult) => {
    setPicked(r);
    setQuery(r.name);
    setResults([]);
  };

  const title = picked?.name ?? query.trim();
  const error = draftError(draft);
  const canAdd = !!title && !error && !saving;

  const submit = async () => {
    if (!canAdd) return;
    setSaving(true);
    const ok = await onAdd({
      title,
      coverUrl: picked?.coverUrl ?? undefined,
      genre: picked?.genres[0],
      releaseYear: picked?.releaseYear ?? undefined,
      developer: picked?.developers[0],
      summary: picked?.summary ?? undefined,
      igdbId: picked?.id,
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
      <div className="modal" role="dialog" aria-label="Add game">
        <SheetHeader
          title="Add game"
          onCancel={onClose}
          confirmLabel={saving ? "Adding…" : "Add"}
          onConfirm={submit}
          confirmDisabled={!canAdd}
        />
        <div className="modal-body">
          <div className="field">
            <label className="field-label" htmlFor="f-search">
              Game
            </label>
            <input
              id="f-search"
              className="input"
              type="search"
              enterKeyHint="search"
              autoCorrect="off"
              autoCapitalize="off"
              autoComplete="off"
              placeholder="Search by title"
              value={query}
              onChange={(e) => search(e.target.value)}
              autoFocus
            />
            {searching && <p className="field-hint">Searching IGDB…</p>}
            {!searching && query.trim().length >= 2 && !picked && results.length === 0 && (
              <p className="field-hint">No matches on IGDB. You can still add it with this title.</p>
            )}
            {results.length > 0 && (
              <ul className="results">
                {results.map((r) => (
                  <li key={r.id}>
                    <button className="result" onClick={() => pick(r)}>
                      {r.coverUrl ? <img src={r.coverUrl} alt="" /> : <span className="result-blank" />}
                      <span className="result-text">
                        <span className="result-name">{r.name}</span>
                        <span className="result-meta">
                          {[r.releaseYear, r.developers[0]].filter(Boolean).join(", ")}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {picked && (
            <div className="picked">
              {picked.coverUrl && <img src={picked.coverUrl} alt="" />}
              <div>
                <strong>{picked.name}</strong>
                <span>{[picked.releaseYear, picked.genres.slice(0, 2).join(" and ")].filter(Boolean).join(", ")}</span>
                <span className="picked-note">Cover and details from IGDB</span>
              </div>
            </div>
          )}

          <EntryFields draft={draft} onChange={setDraft} />

          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={submit} disabled={!canAdd}>
              {saving ? "Adding…" : "Add game"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
