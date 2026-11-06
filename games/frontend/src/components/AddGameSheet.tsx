import { useState } from "react";
import type { CreateGamePayload, Game, IgdbResult, Platform } from "../api/client";
import { useSheet } from "../hooks/useSheet";
import { draftError, emptyDraft, newEntry, type EntryDraft } from "../lib/games";
import EntryFields from "./EntryFields";
import IgdbSearch from "./IgdbSearch";
import SheetHeader from "./SheetHeader";

export default function AddGameSheet({
  games,
  platforms,
  onAdd,
  onOpen,
  onClose,
}: {
  games: Game[];
  platforms: Platform[];
  onAdd: (p: CreateGamePayload) => Promise<boolean>;
  onOpen: (g: Game) => void;
  onClose: () => void;
}) {
  useSheet(onClose);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<IgdbResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<EntryDraft>(() => emptyDraft(platforms));

  const title = selected?.name ?? query.trim();
  const canAdd = !!title && !draftError(draft) && !saving;

  // Already logged? Offer to open it (e.g. to add another platform) instead of a duplicate
  const existing = title
    ? games.find((g) => (selected && g.igdbId === selected.id) || g.title.toLowerCase() === title.toLowerCase())
    : undefined;

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
      entry: newEntry(draft),
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" aria-label="Add Game">
        <SheetHeader
          title="Add Game"
          onCancel={onClose}
          confirmLabel={saving ? "Adding…" : "Add"}
          onConfirm={handleSubmit}
          confirmDisabled={!canAdd}
        />
        <div className="modal-body">
          <IgdbSearch
            autoFocus
            onSelect={setSelected}
            onQuery={(q) => {
              setQuery(q);
              setSelected(null);
            }}
          />

          {existing && (
            <div className="notice">
              <span>"{existing.title}" is already in your library.</span>
              <button
                type="button"
                className="notice-link"
                onClick={() => {
                  onClose();
                  onOpen(existing);
                }}
              >
                Open it →
              </button>
            </div>
          )}

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
