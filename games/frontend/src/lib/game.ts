import type { GameListItem, HardwareType, PlayMode, PlayStatus, UserEntry } from "../api/client";

export const STATUSES: readonly PlayStatus[] = [
  "Backlog",
  "Playing",
  "Completed",
  "Dropped",
  "OnHold",
];

export const MODES: readonly PlayMode[] = ["Handheld", "TV", "CRT"];

export const HARDWARE: readonly HardwareType[] = [
  "Original",
  "Modded",
  "Emulator",
  "Cloud",
];

const STATUS_LABELS: Record<PlayStatus, string> = {
  Backlog: "Backlog",
  Playing: "Playing",
  Completed: "Completed",
  Dropped: "Dropped",
  OnHold: "On Hold",
};

export function statusLabel(status: PlayStatus): string {
  return STATUS_LABELS[status] ?? status;
}

/** The entry shown on a card when a game is logged on several platforms. */
export function primaryEntry(game: GameListItem): UserEntry | undefined {
  if (game.userEntries.length <= 1) return game.userEntries[0];

  // Prefer the one that has actually been played, then the most recent.
  return [...game.userEntries].sort((a, b) => {
    const hours = (b.hoursPlayed ?? 0) - (a.hoursPlayed ?? 0);
    if (hours !== 0) return hours;
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
  })[0];
}

export function totalHours(game: GameListItem): number {
  return game.userEntries.reduce((sum, entry) => sum + (entry.hoursPlayed ?? 0), 0);
}

/**
 * Returns null rather than 0 so callers can render conditionally — `{hours && ...}`
 * on a zero prints a stray "0" in JSX.
 */
export function formatHours(hours: number | null | undefined): string | null {
  if (hours === null || hours === undefined || hours <= 0) return null;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
}

export function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
