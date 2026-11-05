import { useEffect, useRef, useState } from "react";
import { api, type IgdbResult } from "../api/client";

// Type-ahead IGDB search, shared by Add Game and Edit Details
export default function IgdbSearch({
  onSelect,
  onQuery,
  initial = "",
  autoFocus = false,
  label = "Search IGDB",
}: {
  onSelect: (r: IgdbResult) => void;
  onQuery?: (q: string) => void;
  initial?: string;
  autoFocus?: boolean;
  label?: string;
}) {
  const [query, setQuery] = useState(initial);
  const [results, setResults] = useState<IgdbResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Only the latest search may show results: a slow older one, or one that lands after a pick, is dropped
  const latest = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);

  const handleSearch = (q: string) => {
    setQuery(q);
    setPicked(false);
    onQuery?.(q);
    clearTimeout(timer.current);
    const id = ++latest.current;
    if (q.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    timer.current = setTimeout(async () => {
      let found: IgdbResult[] = [];
      try {
        found = await api.search(q.trim());
      } catch {
        // search is a convenience; typing a title still works
      }
      if (id !== latest.current) return;
      setResults(found);
      setSearching(false);
    }, 400);
  };

  const pick = (r: IgdbResult) => {
    latest.current++;
    setPicked(true);
    setSearching(false);
    setQuery(r.name);
    setResults([]);
    onSelect(r);
  };

  return (
    <div className="form-group">
      <label className="form-label" htmlFor="f-search">
        {label}
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
        autoFocus={autoFocus}
      />
      {searching && <div className="form-hint">SEARCHING...</div>}
      {!searching && query.trim().length >= 2 && !picked && results.length === 0 && (
        <div className="form-hint">No IGDB match. You can still use this title.</div>
      )}
      {results.length > 0 && (
        <div className="search-results">
          {results.map((r) => (
            <button key={r.id} type="button" className="search-result-item" onClick={() => pick(r)}>
              {r.coverUrl ? <img src={r.coverUrl} className="search-result-cover" alt="" /> : <div className="search-result-cover" />}
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
  );
}
