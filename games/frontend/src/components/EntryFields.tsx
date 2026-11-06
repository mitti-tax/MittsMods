import type { Platform, PlayStatus } from "../api/client";
import { HARDWARE, MODES, STATUSES, STATUS_LABEL, draftError, type EntryDraft } from "../lib/games";

// Log fields shared by Add Game and Edit Entry
export default function EntryFields({
  draft,
  onChange,
  platforms,
  steam = false,
}: {
  draft: EntryDraft;
  onChange: (d: EntryDraft) => void;
  platforms: Platform[];
  steam?: boolean; // the Steam entry: its platform is always PC
}) {
  const set = (patch: Partial<EntryDraft>) => onChange({ ...draft, ...patch });
  const error = draftError(draft);

  return (
    <>
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="f-platform">
            Platform
          </label>
          <select
            id="f-platform"
            className="form-select"
            value={draft.platformId}
            onChange={(e) => set({ platformId: Number(e.target.value) })}
            disabled={steam}
            title={steam ? "Steam games stay on PC" : undefined}
          >
            {platforms.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="f-status">
            Status
          </label>
          <select
            id="f-status"
            className="form-select"
            value={draft.status}
            onChange={(e) => set({ status: e.target.value as PlayStatus })}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="f-mode">
            Play Mode
          </label>
          <select id="f-mode" className="form-select" value={draft.mode} onChange={(e) => set({ mode: e.target.value })}>
            <option value="">— Not specified</option>
            {MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="f-hardware">
            Hardware
          </label>
          <select
            id="f-hardware"
            className="form-select"
            value={draft.hardware}
            onChange={(e) => set({ hardware: e.target.value })}
          >
            {HARDWARE.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="f-hours">
            Hours Played
          </label>
          <input
            id="f-hours"
            className="form-input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            placeholder="0"
            value={draft.hours}
            onChange={(e) => set({ hours: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="f-rating">
            Rating (1–10)
          </label>
          <input
            id="f-rating"
            className="form-input"
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            step="1"
            placeholder="—"
            value={draft.rating}
            onChange={(e) => set({ rating: e.target.value })}
          />
        </div>
      </div>

      {/* Filled in automatically when the status becomes Playing or Completed */}
      <div className="form-row">
        <div className="form-group">
          <label className="form-label" htmlFor="f-started">
            Started
          </label>
          <input
            id="f-started"
            className="form-input"
            type="date"
            value={draft.started}
            onChange={(e) => set({ started: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="f-completed">
            Finished
          </label>
          <input
            id="f-completed"
            className="form-input"
            type="date"
            value={draft.completed}
            onChange={(e) => set({ completed: e.target.value })}
          />
        </div>
      </div>

      {/* Right under the fields it's about, so it's never off screen */}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor="f-notes">
          Notes
        </label>
        <textarea
          id="f-notes"
          className="form-textarea"
          placeholder="Your thoughts..."
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </>
  );
}
