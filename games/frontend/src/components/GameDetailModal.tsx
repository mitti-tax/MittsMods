import { useEffect, useState } from "react";
import { ApiError, api } from "../api/client";
import type { Game, GameListItem, Platform, UserEntry } from "../api/client";
import Modal from "./Modal";
import ConfirmDialog from "./ConfirmDialog";
import CoverImage from "./CoverImage";
import EntryForm from "./EntryForm";
import {
  emptyEntryValue,
  entryToValue,
  toEntryPayload,
  validateEntry,
  type EntryFormValue,
} from "../lib/entry";
import { formatDate, formatHours, statusLabel } from "../lib/game";

type Editing =
  | { kind: "view" }
  | { kind: "edit"; entryId: number }
  | { kind: "new" };

type Pending = { kind: "game" } | { kind: "entry"; entryId: number };

interface Props {
  gameId: number;
  /** List data, so the dialog has something to show before the fetch lands. */
  initial?: GameListItem;
  platforms: Platform[];
  isLoggedIn: boolean;
  onClose: () => void;
  onChanged: (game: Game) => void;
  onDeleted: (gameId: number) => void;
  onLoginRequest: () => void;
}

export default function GameDetailModal({
  gameId,
  initial,
  platforms,
  isLoggedIn,
  onClose,
  onChanged,
  onDeleted,
  onLoginRequest,
}: Props) {
  const [game, setGame] = useState<Game | null>(
    initial ? { ...initial, summary: null } : null,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editing, setEditing] = useState<Editing>({ kind: "view" });
  const [form, setForm] = useState<EntryFormValue>(() =>
    emptyEntryValue(platforms[0]?.id ?? 1),
  );
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Pending | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);

    api
      .getGame(gameId, controller.signal)
      .then((loaded) => {
        setGame(loaded);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLoading(false);
        setLoadError(
          cause instanceof ApiError ? cause.message : "Could not load the game.",
        );
      });

    return () => controller.abort();
  }, [gameId]);

  const applyChange = (updated: Game) => {
    setGame(updated);
    onChanged(updated);
    setEditing({ kind: "view" });
    setFormError(null);
  };

  const startEdit = (entry: UserEntry) => {
    setForm(entryToValue(entry));
    setFormError(null);
    setEditing({ kind: "edit", entryId: entry.id });
  };

  const startAdd = () => {
    const used = new Set(game?.userEntries.map((entry) => entry.platformId) ?? []);
    const free = platforms.find((platform) => !used.has(platform.id));
    setForm(emptyEntryValue(free?.id ?? platforms[0]?.id ?? 1));
    setFormError(null);
    setEditing({ kind: "new" });
  };

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving || !game) return;

    const invalid = validateEntry(form);
    if (invalid) {
      setFormError(invalid);
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editing.kind === "edit") {
        const existing = game.userEntries.find(
          (entry) => entry.id === editing.entryId,
        );
        applyChange(
          await api.updateEntry(
            game.id,
            editing.entryId,
            toEntryPayload(form, existing),
          ),
        );
      } else if (editing.kind === "new") {
        applyChange(await api.addEntry(game.id, toEntryPayload(form)));
      }
    } catch (cause) {
      setFormError(
        cause instanceof ApiError ? cause.message : "Could not save the entry.",
      );
    } finally {
      setSaving(false);
    }
  };

  const handleConfirm = async () => {
    if (!confirm || !game) return;

    setSaving(true);
    try {
      if (confirm.kind === "game") {
        await api.deleteGame(game.id);
        onDeleted(game.id);
        onClose();
        return;
      }

      applyChange(await api.deleteEntry(game.id, confirm.entryId));
      setConfirm(null);
    } catch (cause) {
      setFormError(
        cause instanceof ApiError ? cause.message : "Could not delete.",
      );
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  };

  const handleFavourite = async () => {
    if (!game) return;
    try {
      applyChange(await api.toggleFavourite(game.id));
    } catch (cause) {
      setFormError(
        cause instanceof ApiError ? cause.message : "Could not update.",
      );
    }
  };

  const usedPlatformIds =
    game?.userEntries
      .filter((entry) =>
        editing.kind === "edit" ? entry.id !== editing.entryId : true,
      )
      .map((entry) => entry.platformId) ?? [];

  return (
    <>
      <Modal title={game?.title ?? initial?.title ?? "Game"} onClose={onClose}>
        {loadError && !game ? (
          <p className="form-error" role="alert">
            {loadError}
          </p>
        ) : (
          <>
            <div className="detail-header">
              <CoverImage
                src={game?.coverUrl ?? initial?.coverUrl ?? null}
                alt={`${game?.title ?? ""} cover art`}
                className="detail-cover"
                eager
              />

              <div className="detail-meta">
                {game?.developer && <div>{game.developer}</div>}
                {game?.releaseYear && (
                  <div className="detail-meta-mono">{game.releaseYear}</div>
                )}
                {game?.genre && <div className="detail-meta-mono">{game.genre}</div>}

                {isLoggedIn && game && (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-small${game.isFavourite ? " is-on" : ""}`}
                    aria-pressed={game.isFavourite}
                    onClick={handleFavourite}
                  >
                    ★ {game.isFavourite ? "Favourite" : "Mark favourite"}
                  </button>
                )}
              </div>
            </div>

            {loading && <p className="field-hint">Loading details…</p>}

            {game?.summary && <p className="detail-summary">{game.summary}</p>}

            <h3 className="detail-section-title">
              {game && game.userEntries.length > 1 ? "Log entries" : "Log entry"}
            </h3>

            {game?.userEntries.length === 0 && (
              <p className="field-hint">No log entries yet.</p>
            )}

            <ul className="entry-list">
              {game?.userEntries.map((entry) => (
                <li className="entry-card" key={entry.id}>
                  {editing.kind === "edit" && editing.entryId === entry.id ? (
                    <form onSubmit={handleSave} noValidate>
                      <EntryForm
                        value={form}
                        platforms={platforms}
                        idPrefix={`entry-${entry.id}`}
                        onChange={setForm}
                        usedPlatformIds={usedPlatformIds}
                      />
                      {formError && (
                        <p className="form-error" role="alert">
                          {formError}
                        </p>
                      )}
                      <div className="btn-row">
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setEditing({ kind: "view" })}
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={saving}
                        >
                          {saving ? "Saving…" : "Save"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <EntrySummary
                      entry={entry}
                      isLoggedIn={isLoggedIn}
                      onEdit={() => startEdit(entry)}
                      onRemove={() =>
                        setConfirm({ kind: "entry", entryId: entry.id })
                      }
                    />
                  )}
                </li>
              ))}
            </ul>

            {editing.kind === "new" && (
              <form onSubmit={handleSave} className="entry-card" noValidate>
                <h4 className="detail-section-title">New entry</h4>
                <EntryForm
                  value={form}
                  platforms={platforms}
                  idPrefix="new-entry"
                  onChange={setForm}
                  usedPlatformIds={usedPlatformIds}
                />
                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditing({ kind: "view" })}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={saving}>
                    {saving ? "Adding…" : "Add entry"}
                  </button>
                </div>
              </form>
            )}

            {formError && editing.kind === "view" && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}

            {editing.kind === "view" && (
              <div className="btn-row">
                {isLoggedIn ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={() => setConfirm({ kind: "game" })}
                    >
                      Delete game
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={startAdd}
                      disabled={
                        !game || game.userEntries.length >= platforms.length
                      }
                    >
                      + Another platform
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={onLoginRequest}
                  >
                    🔒 Log in to edit
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </Modal>

      {confirm && (
        <ConfirmDialog
          title={confirm.kind === "game" ? "Delete game" : "Remove entry"}
          message={
            confirm.kind === "game"
              ? `Permanently delete "${game?.title}" and all of its log entries? This cannot be undone.`
              : "Remove this log entry? The game stays in the library."
          }
          confirmLabel={confirm.kind === "game" ? "Delete" : "Remove"}
          destructive
          busy={saving}
          onConfirm={handleConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  );
}

function EntrySummary({
  entry,
  isLoggedIn,
  onEdit,
  onRemove,
}: {
  entry: UserEntry;
  isLoggedIn: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const hours = formatHours(entry.hoursPlayed);
  const started = formatDate(entry.startedAt);
  const completed = formatDate(entry.completedAt);

  return (
    <>
      <div className="entry-card-head">
        <span className="entry-platform">{entry.platformName}</span>
        <span className={`status-badge status-${entry.status}`}>
          {statusLabel(entry.status)}
        </span>
      </div>

      <div className="entry-facts">
        {hours && <span>{hours}</span>}
        {entry.rating !== null && <span className="entry-rating">★ {entry.rating}/10</span>}
        {entry.mode && <span>{entry.mode}</span>}
        <span className={entry.hardware === "Modded" ? "entry-modded" : undefined}>
          {entry.hardware}
        </span>
        <span>{entry.source}</span>
        {entry.achievementsTotal !== null && (
          <span>
            {entry.achievementsEarned ?? 0}/{entry.achievementsTotal} achievements
          </span>
        )}
        {started && <span>Started {started}</span>}
        {completed && <span>Finished {completed}</span>}
      </div>

      {entry.notes && <p className="entry-notes">{entry.notes}</p>}

      {isLoggedIn && (
        <div className="entry-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={onEdit}>
            Edit
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={onRemove}
          >
            Remove
          </button>
        </div>
      )}
    </>
  );
}
