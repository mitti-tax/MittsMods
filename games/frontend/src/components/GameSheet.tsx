import { useState } from "react";
import type { Game, GameDetails, HardwareType, Platform, PlayMode, UserEntry } from "../api/client";
import { useSheet } from "../hooks/useSheet";
import type { Library } from "../hooks/useLibrary";
import {
  STATUS_LABEL,
  draftError,
  emptyDraft,
  fmtDate,
  fmtHours,
  fromDay,
  newEntry,
  toDay,
  type EntryDraft,
} from "../lib/games";
import ConfirmSheet from "./ConfirmSheet";
import Cover from "./Cover";
import EntryFields from "./EntryFields";
import IgdbSearch from "./IgdbSearch";
import SheetHeader from "./SheetHeader";

const toDraft = (e: UserEntry): EntryDraft => ({
  platformId: e.platformId,
  status: e.status,
  mode: e.mode ?? "",
  hardware: e.hardware,
  hours: e.hoursPlayed == null ? "" : String(e.hoursPlayed),
  rating: e.rating == null ? "" : String(e.rating),
  notes: e.notes ?? "",
  started: toDay(e.startedAt),
  completed: toDay(e.completedAt),
});

const toDetails = (g: Game): GameDetails => ({
  title: g.title,
  coverUrl: g.coverUrl,
  genre: g.genre,
  releaseYear: g.releaseYear,
  developer: g.developer,
  summary: g.summary,
  igdbId: g.igdbId,
});

type Mode =
  | { kind: "view" }
  | { kind: "entry"; draft: EntryDraft }
  | { kind: "addEntry"; draft: EntryDraft }
  | { kind: "details"; details: GameDetails };

export default function GameSheet({
  game,
  platforms,
  isLoggedIn,
  lib,
  notify,
  onClose,
  onLoginRequest,
}: {
  game: Game;
  platforms: Platform[];
  isLoggedIn: boolean;
  lib: Library;
  notify: (msg: string, ok?: boolean) => void;
  onClose: () => void;
  onLoginRequest: () => void;
}) {
  const [entryId, setEntryId] = useState<number | undefined>(game.userEntries[0]?.id);
  const entry = game.userEntries.find((e) => e.id === entryId) ?? game.userEntries[0];
  const [mode, setMode] = useState<Mode>({ kind: "view" });
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "removeEntry" | null>(null);
  const back = () => setMode({ kind: "view" });
  useSheet(() => (mode.kind === "view" ? onClose() : back()));

  const run = async (job: () => Promise<boolean>) => {
    setSaving(true);
    const ok = await job();
    setSaving(false);
    if (ok) back();
  };

  const saveEntry = (d: EntryDraft) =>
    run(() =>
      lib.update(game, entry, {
        platformId: d.platformId,
        status: d.status,
        mode: (d.mode || null) as PlayMode | null,
        hardware: d.hardware as HardwareType,
        hoursPlayed: d.hours ? Number(d.hours) : null, // empty clears the field
        rating: d.rating ? Number(d.rating) : null,
        notes: d.notes.trim() || null,
        // An untouched date goes back exactly as stored, not rounded to its day
        startedAt: d.started === toDay(entry.startedAt) ? entry.startedAt : fromDay(d.started),
        completedAt: d.completed === toDay(entry.completedAt) ? entry.completedAt : fromDay(d.completed),
      }),
    );

  const share = async () => {
    const url = window.location.href; // the sheet's own link (#/...?game=id)
    try {
      if (navigator.share) await navigator.share({ title: game.title, url });
      else {
        await navigator.clipboard.writeText(url);
        notify("Link copied");
      }
    } catch {
      // Share sheet dismissed
    }
  };

  const rate = (n: number) => {
    if (!isLoggedIn) return onLoginRequest();
    lib.update(game, entry, { rating: entry.rating === n ? null : n }, true); // tap again to clear
  };

  let header;
  let body;
  if (mode.kind === "entry" || mode.kind === "addEntry") {
    const adding = mode.kind === "addEntry";
    const invalid = !!draftError(mode.draft);
    const submit = () =>
      adding ? run(() => lib.addEntry(game, newEntry(mode.draft))) : saveEntry(mode.draft);
    header = (
      <SheetHeader
        title={adding ? "Add Platform" : game.title}
        onCancel={back}
        confirmLabel={saving ? "Saving…" : adding ? "Add" : "Save"}
        onConfirm={submit}
        confirmDisabled={saving || invalid}
      />
    );
    body = (
      <>
        <EntryFields
          draft={mode.draft}
          onChange={(draft) => setMode({ ...mode, draft })}
          platforms={platforms}
          steam={!adding && entry.source === "Steam"}
        />
        {/* The Steam entry stays: sync updates the game through it */}
        {!adding && game.userEntries.length > 1 && entry.source !== "Steam" && (
          <button className="btn btn-danger btn-block" onClick={() => setConfirm("removeEntry")}>
            Remove {entry.platformName} from this game
          </button>
        )}
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={back}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || invalid}>
            {saving ? "Saving..." : adding ? "Add Platform" : "Save"}
          </button>
        </div>
      </>
    );
  } else if (mode.kind === "details") {
    const d = mode.details;
    const set = (p: Partial<GameDetails>) => setMode({ kind: "details", details: { ...d, ...p } });
    const invalid = !d.title.trim();
    const submit = () => run(() => lib.updateDetails(game, { ...d, title: d.title.trim() }));
    header = (
      <SheetHeader
        title="Edit Details"
        onCancel={back}
        confirmLabel={saving ? "Saving…" : "Save"}
        onConfirm={submit}
        confirmDisabled={saving || invalid}
      />
    );
    body = (
      <>
        <IgdbSearch
          label="Wrong game? Find the right one on IGDB"
          onSelect={(r) =>
            set({
              title: r.name,
              coverUrl: r.coverUrl ?? d.coverUrl,
              genre: r.genres[0] ?? null,
              releaseYear: r.releaseYear,
              developer: r.developers[0] ?? null,
              summary: r.summary,
              igdbId: r.id,
            })
          }
        />
        <div className="form-group">
          <label className="form-label" htmlFor="d-title">
            Title
          </label>
          <input id="d-title" className="form-input" value={d.title} onChange={(e) => set({ title: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="d-cover">
            Cover image URL
          </label>
          <div className="cover-field">
            <Cover src={d.coverUrl} className="cover-field-preview" lazy={false} key={d.coverUrl} />
            <input
              id="d-cover"
              className="form-input"
              type="url"
              inputMode="url"
              autoCapitalize="off"
              value={d.coverUrl ?? ""}
              onChange={(e) => set({ coverUrl: e.target.value || null })}
            />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label" htmlFor="d-genre">
              Genre
            </label>
            <input id="d-genre" className="form-input" value={d.genre ?? ""} onChange={(e) => set({ genre: e.target.value || null })} />
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor="d-year">
              Release year
            </label>
            <input
              id="d-year"
              className="form-input"
              type="number"
              inputMode="numeric"
              min="1950"
              max="2100"
              value={d.releaseYear ?? ""}
              onChange={(e) => set({ releaseYear: e.target.value ? Number(e.target.value) : null })}
            />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="d-dev">
            Developer
          </label>
          <input id="d-dev" className="form-input" value={d.developer ?? ""} onChange={(e) => set({ developer: e.target.value || null })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="d-summary">
            Summary
          </label>
          <textarea
            id="d-summary"
            className="form-textarea"
            value={d.summary ?? ""}
            onChange={(e) => set({ summary: e.target.value || null })}
          />
        </div>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={back}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={saving || invalid}>
            {saving ? "Saving..." : "Save Details"}
          </button>
        </div>
      </>
    );
  } else {
    header = (
      <div className="modal-header">
        <span className="modal-title">{game.title}</span>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>
    );
    const usedPlatforms = new Set(game.userEntries.map((e) => e.platformId));
    body = (
      <>
        <div className="detail-top">
          <Cover src={game.coverUrl} className="detail-cover" lazy={false} />
          <div>
            {game.developer && <div className="detail-developer">{game.developer}</div>}
            {game.releaseYear && <div className="detail-year">{game.releaseYear}</div>}
            {game.genre && <div className="detail-genre">{game.genre}</div>}
            {entry && (
              <div className="detail-tags">
                <span className={`status-badge status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
                {!!entry.hoursPlayed && <span className="detail-tag">{fmtHours(entry.hoursPlayed)}</span>}
                {!!game.timeToBeatHours && <span className="detail-tag">~{game.timeToBeatHours}h to beat</span>}
                <span className="detail-tag">{entry.platformName}</span>
                {entry.mode && <span className="detail-tag">{entry.mode}</span>}
                <span className={`detail-tag ${entry.hardware === "Modded" ? "detail-modded" : ""}`}>{entry.hardware}</span>
                <span className="detail-tag">{entry.source}</span>
                {game.isHidden && <span className="detail-tag">Hidden</span>}
              </div>
            )}
          </div>
        </div>

        {game.userEntries.length > 1 && (
          <div className="segmented" role="tablist" aria-label="Platform">
            {game.userEntries.map((e) => (
              <button
                key={e.id}
                role="tab"
                aria-selected={e.id === entry.id}
                className={e.id === entry.id ? "active" : ""}
                onClick={() => setEntryId(e.id)}
              >
                {e.platformName}
              </button>
            ))}
          </div>
        )}

        {entry && (isLoggedIn || !!entry.rating) && (
          <div className="star-rating" role="group" aria-label="Rating">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                className={n <= (entry.rating ?? 0) ? "on" : ""}
                aria-label={`Rate ${n} out of 10`}
                aria-pressed={entry.rating === n}
                disabled={!isLoggedIn}
                onClick={() => rate(n)}
              >
                ★
              </button>
            ))}
            <span className="star-value">{entry.rating ? `${entry.rating}/10` : "Not rated"}</span>
          </div>
        )}

        {entry && (entry.startedAt || entry.completedAt || entry.lastPlayedAt) && (
          <div className="detail-dates">
            {entry.startedAt && <span>Started {fmtDate(entry.startedAt)}</span>}
            {entry.completedAt && <span>Finished {fmtDate(entry.completedAt)}</span>}
            {entry.lastPlayedAt && <span>Last played {fmtDate(entry.lastPlayedAt)}</span>}
          </div>
        )}

        {game.summary && <p className="detail-summary">{game.summary}</p>}
        {entry?.notes && <div className="detail-notes">{entry.notes}</div>}
        {entry?.achievementsTotal != null && entry.achievementsTotal > 0 && (
          <div className="detail-achievements">
            ACHIEVEMENTS: {entry.achievementsEarned ?? 0} / {entry.achievementsTotal}
          </div>
        )}

        {!!entry?.history?.length && (
          <details className="detail-history">
            <summary>Status history ({entry.history.length})</summary>
            <ol>
              {entry.history.map((h, i) => (
                <li key={i}>
                  <span className={`status-badge status-${h.status}`}>{STATUS_LABEL[h.status]}</span>
                  <span>{fmtDate(h.changedAt)}</span>
                </li>
              ))}
            </ol>
          </details>
        )}

        {isLoggedIn ? (
          <>
            <div className="btn-row">
              {entry && (
                <button className="btn btn-primary" onClick={() => setMode({ kind: "entry", draft: toDraft(entry) })}>
                  Edit Entry
                </button>
              )}
              <button
                className={`btn btn-ghost ${game.isFavourite ? "btn-fav" : ""}`}
                aria-pressed={game.isFavourite}
                onClick={() => lib.toggleFavourite(game)}
              >
                {game.isFavourite ? "★ Favourite" : "☆ Favourite"}
              </button>
              <button className="btn btn-ghost" onClick={share}>
                Share
              </button>
            </div>
            <div className="btn-row">
              <button className="btn btn-ghost" onClick={() => setMode({ kind: "details", details: toDetails(game) })}>
                Edit Details
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  // PC unless the game is already logged there, then the first unused platform
                  const d = emptyDraft(platforms);
                  const free = platforms.find((p) => !usedPlatforms.has(p.id));
                  const platformId = usedPlatforms.has(d.platformId) ? (free?.id ?? d.platformId) : d.platformId;
                  setMode({ kind: "addEntry", draft: { ...d, platformId } });
                }}
              >
                + Platform
              </button>
              {game.isHidden ? (
                <button className="btn btn-ghost" onClick={() => lib.setHidden([game], false)}>
                  Unhide
                </button>
              ) : game.steamAppId ? (
                // Steam games are hidden rather than deleted, or the next sync adds them back
                <button
                  className="btn btn-danger"
                  onClick={async () => {
                    if (await lib.setHidden([game], true)) onClose();
                  }}
                >
                  Hide
                </button>
              ) : (
                <button className="btn btn-danger" onClick={() => setConfirm("delete")}>
                  Delete
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={share}>
              Share
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                onClose();
                onLoginRequest();
              }}
            >
              🔒 Log in to edit
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="modal-overlay" onClick={mode.kind === "view" ? onClose : undefined}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={game.title} onClick={(e) => e.stopPropagation()}>
        {header}
        <div className="modal-body">{body}</div>
      </div>

      {confirm === "delete" && (
        <ConfirmSheet
          title={`Delete "${game.title}"?`}
          message="This removes the game and every log entry for it. It can't be undone."
          confirmLabel="Delete Game"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            if (await lib.remove(game)) onClose();
          }}
        />
      )}
      {confirm === "removeEntry" && (
        <ConfirmSheet
          title={`Remove ${entry.platformName}?`}
          message={`This deletes the ${entry.platformName} log for ${game.title}: hours, rating and notes.`}
          confirmLabel="Remove Platform"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            setConfirm(null);
            if (await lib.removeEntry(game, entry)) {
              setEntryId(game.userEntries.find((e) => e.id !== entry.id)?.id);
              back();
            }
          }}
        />
      )}
    </div>
  );
}
