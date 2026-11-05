import { useState } from "react";
import type { Game, HardwareType, PlayMode, UpdateEntryPayload, UserEntry } from "../api/client";
import { useEscape } from "../hooks/useEscape";
import { STATUS_LABEL, draftError, entryOf, familyOf, fmtHours, type EntryDraft } from "../lib/games";
import { usePlatform } from "../lib/platforms";
import ConfirmSheet from "./ConfirmSheet";
import EntryFields from "./EntryFields";
import { Cover } from "./GameCard";
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

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : null;

export default function GameSheet({
  game,
  isLoggedIn,
  onClose,
  onSave,
  onDelete,
  onToggleFavourite,
}: {
  game: Game;
  isLoggedIn: boolean;
  onClose: () => void;
  onSave: (g: Game, e: UserEntry, changes: UpdateEntryPayload) => Promise<boolean>;
  onDelete: (g: Game) => Promise<boolean>;
  onToggleFavourite: (g: Game) => void;
}) {
  const entry = entryOf(game);
  const platform = usePlatform(entry?.platformId);
  const [draft, setDraft] = useState<EntryDraft | null>(null); // non-null = editing
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);
  useEscape(() => (draft ? setDraft(null) : onClose()));

  const error = draft && draftError(draft);

  const save = async () => {
    if (!entry || !draft || error) return;
    setSaving(true);
    // Empty fields send null, which clears them
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

  const longSummary = (game.summary?.length ?? 0) > 320;

  const facts: [string, string | null][] = entry
    ? [
        ["Console", platform?.name ?? entry.platformName],
        ["Hours", fmtHours(entry.hoursPlayed) || null],
        ["Rating", entry.rating ? `${entry.rating} / 10` : null],
        ["Played on", entry.mode],
        ["Hardware", entry.hardware],
        [
          "Achievements",
          entry.achievementsTotal ? `${entry.achievementsEarned ?? 0} of ${entry.achievementsTotal}` : null,
        ],
        ["Started", fmtDate(entry.startedAt)],
        ["Finished", fmtDate(entry.completedAt)],
        ["Logged from", entry.source === "Steam" ? "Steam sync" : "Added by hand"],
      ]
    : [];

  return (
    <div className="modal-overlay" onClick={draft ? undefined : onClose}>
      <div
        className="modal game-sheet"
        role="dialog"
        aria-label={game.title}
        data-family={familyOf(entry?.platformId)}
        onClick={(e) => e.stopPropagation()}
      >
        {draft ? (
          <>
            <SheetHeader
              title={`Edit ${game.title}`}
              onCancel={() => setDraft(null)}
              confirmLabel={saving ? "Saving…" : "Save"}
              onConfirm={save}
              confirmDisabled={saving || !!error}
            />
            <div className="modal-body">
              <EntryFields draft={draft} onChange={setDraft} />
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => setDraft(null)}>
                  Cancel
                </button>
                <button className="btn btn-primary" onClick={save} disabled={saving || !!error}>
                  {saving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="sheet-hero">
              {game.coverUrl && <img className="sheet-hero-bg" src={game.coverUrl} alt="" />}
              <Cover game={game} className="sheet-cover" />
              <div className="sheet-hero-text">
                <h2 className="sheet-title">{game.title}</h2>
                <p className="sheet-sub">
                  {[game.developer, game.releaseYear, game.genre].filter(Boolean).join(", ")}
                </p>
                {entry && (
                  <span className={`status status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                )}
              </div>
              <button className="modal-close sheet-close" onClick={onClose} aria-label="Close">
                ✕
              </button>
            </header>

            <div className="modal-body">
              {entry ? (
                <dl className="facts">
                  {facts
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k}>
                        <dt>{k}</dt>
                        <dd>{v}</dd>
                      </div>
                    ))}
                </dl>
              ) : (
                <p className="muted">This game has no play log yet.</p>
              )}

              {entry?.notes && <blockquote className="notes">{entry.notes}</blockquote>}

              {game.summary && (
                <div className="summary">
                  <h3 className="summary-title">About the game</h3>
                  <p className={longSummary && !showFullSummary ? "clamped" : undefined}>{game.summary}</p>
                  {longSummary && (
                    <button className="link-btn" onClick={() => setShowFullSummary((s) => !s)}>
                      {showFullSummary ? "Show less" : "Show more"}
                    </button>
                  )}
                </div>
              )}

              {isLoggedIn && (
                <div className="sheet-actions">
                  <button
                    className={`btn btn-ghost ${game.isFavourite ? "is-fav" : ""}`}
                    aria-pressed={game.isFavourite}
                    onClick={() => onToggleFavourite(game)}
                  >
                    {game.isFavourite ? "★ Favourite" : "☆ Add to favourites"}
                  </button>
                  {entry && (
                    <button className="btn btn-primary" onClick={() => setDraft(toDraft(entry))}>
                      Edit log
                    </button>
                  )}
                  <button className="btn btn-danger" onClick={() => setConfirmDelete(true)}>
                    Delete
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {confirmDelete && (
        <ConfirmSheet
          title={`Delete ${game.title}?`}
          message="This removes the game and its play log from your library."
          confirmLabel="Delete game"
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
