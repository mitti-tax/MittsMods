import type { Platform, HardwareType, PlayMode, PlayStatus } from "../api/client";
import { HARDWARE, MODES, STATUSES, statusLabel } from "../lib/game";
import type { EntryFormValue } from "../lib/entry";

interface Props {
  value: EntryFormValue;
  platforms: Platform[];
  idPrefix: string;
  onChange: (value: EntryFormValue) => void;
  /** Platform ids already used by other entries of the same game. */
  usedPlatformIds?: number[];
}

export default function EntryForm({
  value,
  platforms,
  idPrefix,
  onChange,
  usedPlatformIds = [],
}: Props) {
  const update = <K extends keyof EntryFormValue>(
    key: K,
    next: EntryFormValue[K],
  ) => onChange({ ...value, [key]: next });

  // min/max/step stay for the spinners and the mobile keyboard, but the forms
  // are noValidate: validateEntry is the single path, so every message is
  // styled the same and announced, including the cross-field date rule.
  return (
    <>
      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-platform`}>
            Platform
          </label>
          <select
            id={`${idPrefix}-platform`}
            className="form-select"
            value={value.platformId}
            onChange={(event) => update("platformId", Number(event.target.value))}
          >
            {platforms.map((platform) => (
              <option
                key={platform.id}
                value={platform.id}
                disabled={
                  platform.id !== value.platformId &&
                  usedPlatformIds.includes(platform.id)
                }
              >
                {platform.name}
                {platform.id !== value.platformId &&
                usedPlatformIds.includes(platform.id)
                  ? " — already logged"
                  : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-status`}>
            Status
          </label>
          <select
            id={`${idPrefix}-status`}
            className="form-select"
            value={value.status}
            onChange={(event) => update("status", event.target.value as PlayStatus)}
          >
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {statusLabel(status)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-mode`}>
            Play Mode
          </label>
          <select
            id={`${idPrefix}-mode`}
            className="form-select"
            value={value.mode}
            onChange={(event) => update("mode", event.target.value as PlayMode | "")}
          >
            <option value="">— Not specified</option>
            {MODES.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-hardware`}>
            Hardware
          </label>
          <select
            id={`${idPrefix}-hardware`}
            className="form-select"
            value={value.hardware}
            onChange={(event) =>
              update("hardware", event.target.value as HardwareType)
            }
          >
            {HARDWARE.map((hardware) => (
              <option key={hardware} value={hardware}>
                {hardware}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-hours`}>
            Hours Played
          </label>
          <input
            id={`${idPrefix}-hours`}
            className="form-input"
            type="number"
            min="0"
            max="100000"
            step="0.5"
            inputMode="decimal"
            placeholder="0"
            value={value.hours}
            onChange={(event) => update("hours", event.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-rating`}>
            Rating (1–10)
          </label>
          <input
            id={`${idPrefix}-rating`}
            className="form-input"
            type="number"
            min="1"
            max="10"
            step="1"
            inputMode="numeric"
            placeholder="—"
            value={value.rating}
            onChange={(event) => update("rating", event.target.value)}
          />
        </div>
      </div>

      <div className="form-grid">
        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-started`}>
            Started
          </label>
          <input
            id={`${idPrefix}-started`}
            className="form-input"
            type="date"
            value={value.startedAt}
            onChange={(event) => update("startedAt", event.target.value)}
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor={`${idPrefix}-completed`}>
            Completed
          </label>
          <input
            id={`${idPrefix}-completed`}
            className="form-input"
            type="date"
            value={value.completedAt}
            onChange={(event) => update("completedAt", event.target.value)}
          />
        </div>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor={`${idPrefix}-notes`}>
          Notes
        </label>
        <textarea
          id={`${idPrefix}-notes`}
          className="form-textarea"
          placeholder="Your thoughts…"
          maxLength={4000}
          value={value.notes}
          onChange={(event) => update("notes", event.target.value)}
        />
      </div>
    </>
  );
}
