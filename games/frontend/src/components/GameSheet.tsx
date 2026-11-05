import { useState } from "react";
import type { Game, HardwareType, Platform, PlayMode, UpdateEntryPayload, UserEntry } from "../api/client";
import { useEscape } from "../hooks/useEscape";
import { STATUS_LABEL, draftError, entryOf, fmtHours, type EntryDraft } from "../lib/games";
import ConfirmSheet from "./ConfirmSheet";
import EntryFields from "./EntryFields";
import SheetHeader from "./SheetHeader";

const toDraft = (e: UserEntry): EntryDraft => ({
  platformId: e.platformId,
  status: e.status,
  mode: e.mode ?? "",
  hardware: e.hardware,
  hours: e.hoursPlayed == null ? "" : String(e.hoursPlayed),
  rating: e.rating == null ? "" : String(e.rating),
  notes: e.notes ?? "",
});

export default function GameSheet({
  game,
  platforms,
  isLoggedIn,
  onClose,
  onSave,
  onDelete,
  onToggleFavourite,
  onLoginRequest,
}: {
  game: Game;
  platforms: Platform[];
  isLoggedIn: boolean;
  onClose: () => void;
  onSave: (g: Game, e: UserEntry, changes: UpdateEntryPayload) => Promise<boolean>;
  onDelete: (g: Game) => Promise<boolean>;
  onToggleFavourite: (g: Game) => void;
  onLoginRequest: () => void;
}) {
  const entry = entryOf(game);
  const [draft, setDraft] = useState<EntryDraft | null>(null); // non-null = editing
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEscape(() => (draft ? setDraft(null) : onClose()));

  const invalid = !!draft && !!draftError(draft);

  const handleSave = async () => {
    if (!entry || !draft || invalid) return;
    setSaving(true);
    // Empty inputs send null, which clears the field
    const ok = await onSave(game, entry, {
      platformId: draft.platformId,
      status: draft.status,
      mode: (draft.mode || null) as PlayMode | null,
      hardware: draft.hardware as HardwareType,
      hoursPlayed: draft.hours ? Number(draft.hours) : null,
      rating: draft.rating ? Number(draft.rating) : null,
      notes: draft.notes.trim() || null,
    });
    setSaving(false);
    if (ok) setDraft(null);
  };

  return (
    <div className="modal-overlay" onClick={draft ? undefined : onClose}>
      <div className="modal" role="dialog" aria-label={game.title} onClick={(e) => e.stopPropagation()}>
        {draft ? (
          <SheetHeader
            title={game.title}
            onCancel={() => setDraft(null)}
            confirmLabel={saving ? "Saving…" : "Save"}
            onConfirm={handleSave}
            confirmDisabled={saving || invalid}
          />
        ) : (
          <div className="modal-header">
            <span className="modal-title">{game.title}</span>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        )}

        <div className="modal-body">
          <div className="detail-top">
            {game.coverUrl && <img src={game.coverUrl} className="detail-cover" alt="" />}
            <div>
              {game.developer && <div className="detail-developer">{game.developer}</div>}
              {game.releaseYear && <div className="detail-year">{game.releaseYear}</div>}
              {game.genre && <div className="detail-genre">{game.genre}</div>}
              {entry && (
                <div className="detail-tags">
                  <span className={`status-badge status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                  {!!entry.hoursPlayed && <span className="detail-tag">{fmtHours(entry.hoursPlayed)}</span>}
                  {!!entry.rating && <span className="detail-tag detail-rating">★ {entry.rating}/10</span>}
                  <span className="detail-tag">{entry.platformName}</span>
                  {entry.mode && <span className="detail-tag">{entry.mode}</span>}
                  <span className={`detail-tag ${entry.hardware === "Modded" ? "detail-modded" : ""}`}>
                    {entry.hardware}
                  </span>
                  <span className="detail-tag">{entry.source}</span>
                </div>
              )}
            </div>
          </div>

          {!draft && game.summary && <p className="detail-summary">{game.summary}</p>}

          {draft ? (
            <>
              <EntryFields draft={draft} onChange={setDraft} platforms={platforms} />
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={handleSave} disabled={saving || invalid}>
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </>
          ) : (
            <>
              {entry?.notes && <div className="detail-notes">{entry.notes}</div>}
              {entry?.achievementsTotal != null && entry.achievementsTotal > 0 && (
                <div className="detail-achievements">
                  ACHIEVEMENTS: {entry.achievementsEarned ?? 0} / {entry.achievementsTotal}
                </div>
              )}
              <div className="btn-row">
                {isLoggedIn ? (
                  <>
                    <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </button>
                    <button
                      className={`btn btn-ghost ${game.isFavourite ? "btn-fav" : ""}`}
                      aria-pressed={game.isFavourite}
                      onClick={() => onToggleFavourite(game)}
                    >
                      {game.isFavourite ? "★ Favourite" : "☆ Favourite"}
                    </button>
                    {entry && (
                      <button className="btn btn-ghost" onClick={() => setDraft(toDraft(entry))}>
                        Edit Entry
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      onClose();
                      onLoginRequest();
                    }}
                  >
                    🔒 Log in to edit
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {confirmDelete && (
        <ConfirmSheet
          title={`Delete "${game.title}"?`}
          message="This removes the game and its log entry. It can't be undone."
          confirmLabel="Delete Game"
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            setConfirmDelete(false);
            if (await onDelete(game)) onClose();
          }}
        />
      )}
    </div>
  );
}
