import { useContext } from "react";
import type { PlayStatus } from "../api/client";
import { HARDWARE, MODES, STATUSES, STATUS_LABEL, draftError, familyOf, type EntryDraft } from "../lib/games";
import { PlatformsContext } from "../lib/platforms";

const FAMILY_NAME: Record<string, string> = {
  pc: "PC",
  xbox: "Xbox",
  playstation: "PlayStation",
  nintendo: "Nintendo",
  sega: "Sega",
  other: "Other",
};

// Log fields shared by Add game and Edit
export default function EntryFields({
  draft,
  onChange,
}: {
  draft: EntryDraft;
  onChange: (d: EntryDraft) => void;
}) {
  const platforms = useContext(PlatformsContext);
  const set = (patch: Partial<EntryDraft>) => onChange({ ...draft, ...patch });
  const families = Object.keys(FAMILY_NAME).filter((f) => platforms.some((p) => familyOf(p.id) === f));

  return (
    <>
      <div className="field">
        <label className="field-label" htmlFor="f-platform">
          Console
        </label>
        <select
          id="f-platform"
          className="input"
          value={draft.platformId}
          onChange={(e) => set({ platformId: Number(e.target.value) })}
        >
          {families.map((f) => (
            <optgroup key={f} label={FAMILY_NAME[f]}>
              {platforms
                .filter((p) => familyOf(p.id) === f)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      <Segmented
        label="Status"
        name="status"
        value={draft.status}
        options={STATUSES.map((s) => [s, STATUS_LABEL[s]])}
        onChange={(v) => set({ status: v as PlayStatus })}
      />
      <Segmented
        label="Played on"
        name="mode"
        value={draft.mode}
        options={[["", "Not set"], ...MODES.map((m) => [m, m] as [string, string])]}
        onChange={(v) => set({ mode: v })}
      />
      <Segmented
        label="Hardware"
        name="hardware"
        value={draft.hardware}
        options={HARDWARE.map((h) => [h, h])}
        onChange={(v) => set({ hardware: v })}
      />

      <div className="field-pair">
        <div className="field">
          <label className="field-label" htmlFor="f-hours">
            Hours played
          </label>
          <input
            id="f-hours"
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            placeholder="0"
            value={draft.hours}
            onChange={(e) => set({ hours: e.target.value })}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="f-rating">
            Rating out of 10
          </label>
          <input
            id="f-rating"
            className="input"
            type="number"
            inputMode="numeric"
            min="1"
            max="10"
            step="1"
            placeholder="Unrated"
            value={draft.rating}
            onChange={(e) => set({ rating: e.target.value })}
          />
        </div>
      </div>

      {/* Right under the numbers it's about, so it's never off screen */}
      {draftError(draft) && <p className="form-error" role="alert">{draftError(draft)}</p>}

      <div className="field">
        <label className="field-label" htmlFor="f-notes">
          Notes
        </label>
        <textarea
          id="f-notes"
          className="input"
          rows={3}
          placeholder="Mods, settings, thoughts…"
          value={draft.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />
      </div>
    </>
  );
}

function Segmented({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: [string, string][];
  onChange: (v: string) => void;
}) {
  return (
    <fieldset className="field">
      <legend className="field-label">{label}</legend>
      <div className="segmented">
        {options.map(([v, text]) => (
          <label key={v} className="seg">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} />
            <span>{text}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
