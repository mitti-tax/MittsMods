import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Game, IgdbResult, Platform } from "../api/client";
import Modal from "./Modal";
import CoverImage from "./CoverImage";
import EntryForm from "./EntryForm";
import {
  emptyEntryValue,
  toEntryPayload,
  validateEntry,
  type EntryFormValue,
} from "../lib/entry";

const SEARCH_DEBOUNCE_MS = 350;

interface Props {
  platforms: Platform[];
  onClose: () => void;
  onCreated: (game: Game) => void;
  onOpenExisting: (gameId: number) => void;
}

export default function AddGameModal({
  platforms,
  onClose,
  onCreated,
  onOpenExisting,
}: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<IgdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [selected, setSelected] = useState<IgdbResult | null>(null);
  const [entry, setEntry] = useState<EntryFormValue>(() =>
    emptyEntryValue(platforms[0]?.id ?? 1),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<number | null>(null);

  // Skips the lookup when the box holds the title of an already-picked result.
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }

    const term = query.trim();
    if (term.length < 2) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearching(true);
      setSearchError(null);

      api
        .search(term, controller.signal)
        .then((found) => {
          setResults(found);
          setSearching(false);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") return;
          setResults([]);
          setSearching(false);
          setSearchError(
            cause instanceof ApiError ? cause.message : "Search failed.",
          );
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const handleSelect = (result: IgdbResult) => {
    skipNextSearch.current = true;
    setSelected(result);
    setQuery(result.name);
    setResults([]);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;

    const title = (selected?.name ?? query).trim();
    if (!title) {
      setError("Give the game a title, or pick one from the search results.");
      return;
    }

    const invalid = validateEntry(entry);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSaving(true);
    setError(null);
    setDuplicateId(null);

    try {
      const game = await api.createGame({
        title,
        coverUrl: selected?.coverUrl ?? null,
        genre: selected?.genres[0] ?? null,
        releaseYear: selected?.releaseYear ?? null,
        developer: selected?.developers[0] ?? null,
        summary: selected?.summary ?? null,
        igdbId: selected?.id ?? null,
        entry: toEntryPayload(entry),
      });

      onCreated(game);
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
        if (cause.status === 409 && cause.gameId) setDuplicateId(cause.gameId);
      } else {
        setError("Could not add the game.");
      }
      setSaving(false);
    }
  };

  return (
    <Modal title="Add Game" onClose={onClose}>
      <form onSubmit={handleSubmit} noValidate>
        <div className="form-group">
          <label className="form-label" htmlFor="igdb-search">
            Search IGDB
          </label>
          <input
            id="igdb-search"
            className="form-input"
            placeholder="Start typing a game name…"
            value={query}
            autoComplete="off"
            onChange={(event) => {
              const next = event.target.value;
              setQuery(next);
              setSelected(null);
              if (next.trim().length < 2) {
                setResults([]);
                setSearchError(null);
              }
            }}
          />

          {searching && <p className="field-hint">Searching…</p>}
          {searchError && (
            <p className="field-hint field-hint-error">{searchError}</p>
          )}
          {!searching &&
            !searchError &&
            !selected &&
            query.trim().length >= 2 &&
            results.length === 0 && (
              <p className="field-hint">
                No IGDB match — the title above will be saved as typed.
              </p>
            )}

          {results.length > 0 && (
            <ul className="search-results">
              {results.map((result) => (
                <li key={result.id}>
                  <button
                    type="button"
                    className="search-result-item"
                    onClick={() => handleSelect(result)}
                  >
                    <CoverImage
                      src={result.coverUrl}
                      alt=""
                      className="search-result-cover"
                    />
                    <span className="search-result-info">
                      <span className="search-result-name">{result.name}</span>
                      <span className="search-result-meta">
                        {result.releaseYear ?? "—"}
                        {result.developers[0] ? ` · ${result.developers[0]}` : ""}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {selected && (
          <div className="selected-game">
            <CoverImage
              src={selected.coverUrl}
              alt=""
              className="selected-game-cover"
            />
            <div>
              <div className="selected-game-title">{selected.name}</div>
              <div className="selected-game-meta">
                {[selected.releaseYear, selected.genres.join(", ")]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="selected-game-flag">✓ IGDB data loaded</div>
            </div>
          </div>
        )}

        <EntryForm
          value={entry}
          platforms={platforms}
          idPrefix="add"
          onChange={setEntry}
        />

        {error && (
          <p className="form-error" role="alert">
            {error}
            {duplicateId !== null && (
              <>
                {" "}
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => onOpenExisting(duplicateId)}
                >
                  Open it
                </button>
              </>
            )}
          </p>
        )}

        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || !(selected?.name ?? query).trim()}
          >
            {saving ? "Adding…" : "Add Game"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
