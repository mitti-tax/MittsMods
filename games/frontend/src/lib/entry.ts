import type {
  EntryPayload,
  HardwareType,
  PlayMode,
  PlayStatus,
  UserEntry,
} from "../api/client";

export interface EntryFormValue {
  platformId: number;
  status: PlayStatus;
  mode: PlayMode | "";
  hardware: HardwareType;
  hours: string;
  rating: string;
  notes: string;
  startedAt: string;
  completedAt: string;
}

export function emptyEntryValue(platformId: number): EntryFormValue {
  return {
    platformId,
    status: "Backlog",
    mode: "",
    hardware: "Original",
    hours: "",
    rating: "",
    notes: "",
    startedAt: "",
    completedAt: "",
  };
}

export function entryToValue(entry: UserEntry): EntryFormValue {
  return {
    platformId: entry.platformId,
    status: entry.status,
    mode: entry.mode ?? "",
    hardware: entry.hardware,
    hours: entry.hoursPlayed === null ? "" : String(entry.hoursPlayed),
    rating: entry.rating === null ? "" : String(entry.rating),
    notes: entry.notes ?? "",
    startedAt: toDateInput(entry.startedAt),
    completedAt: toDateInput(entry.completedAt),
  };
}

/**
 * The update endpoint is a PUT, so every field is sent — that is what makes it
 * possible to clear a note or a rating. Steam-owned achievement counts are
 * carried through from the existing entry rather than wiped.
 */
export function toEntryPayload(
  value: EntryFormValue,
  existing?: UserEntry,
): EntryPayload {
  return {
    platformId: value.platformId,
    status: value.status,
    hoursPlayed: parseNumber(value.hours),
    rating: parseNumber(value.rating),
    notes: value.notes.trim() || null,
    mode: value.mode || null,
    hardware: value.hardware,
    startedAt: fromDateInput(value.startedAt),
    completedAt: fromDateInput(value.completedAt),
    achievementsEarned: existing?.achievementsEarned ?? null,
    achievementsTotal: existing?.achievementsTotal ?? null,
  };
}

/** Returns a message when the values would be rejected by the API. */
export function validateEntry(value: EntryFormValue): string | null {
  const hours = parseNumber(value.hours);
  if (hours !== null && (hours < 0 || hours > 100000)) {
    return "Hours played must be between 0 and 100,000.";
  }

  const rating = parseNumber(value.rating);
  if (rating !== null && (rating < 1 || rating > 10 || !Number.isInteger(rating))) {
    return "Rating must be a whole number from 1 to 10.";
  }

  if (value.startedAt && value.completedAt && value.completedAt < value.startedAt) {
    return "The completion date cannot be before the start date.";
  }

  if (!value.platformId) return "Choose a platform.";

  return null;
}

function parseNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function toDateInput(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function fromDateInput(value: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * Builds a full update payload from an existing entry, optionally overriding
 * a field. Used by the inline status dropdown, where the PUT still has to
 * carry every value the entry already has.
 */
export function existingEntryToPayload(
  entry: UserEntry,
  overrides: Partial<EntryPayload> = {},
): EntryPayload {
  return {
    platformId: entry.platformId,
    status: entry.status,
    hoursPlayed: entry.hoursPlayed,
    rating: entry.rating,
    notes: entry.notes,
    achievementsEarned: entry.achievementsEarned,
    achievementsTotal: entry.achievementsTotal,
    mode: entry.mode,
    hardware: entry.hardware,
    startedAt: entry.startedAt,
    completedAt: entry.completedAt,
    ...overrides,
  };
}
