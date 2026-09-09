import type { GameListItem } from "../api/client";

const COLUMNS = [
  "Title",
  "Platform",
  "Status",
  "Hours",
  "Rating",
  "Mode",
  "Hardware",
  "Source",
  "Year",
  "Developer",
  "Genre",
  "Achievements earned",
  "Achievements total",
  "Started",
  "Completed",
  "Favourite",
  "Notes",
] as const;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per log entry, so a game played on two platforms exports twice. */
export function gamesToCsv(games: GameListItem[]): string {
  const rows: string[] = [COLUMNS.join(",")];

  for (const game of games) {
    const entries = game.userEntries.length > 0 ? game.userEntries : [null];

    for (const entry of entries) {
      rows.push(
        [
          game.title,
          entry?.platformName,
          entry?.status,
          entry?.hoursPlayed,
          entry?.rating,
          entry?.mode,
          entry?.hardware,
          entry?.source,
          game.releaseYear,
          game.developer,
          game.genre,
          entry?.achievementsEarned,
          entry?.achievementsTotal,
          entry?.startedAt?.slice(0, 10),
          entry?.completedAt?.slice(0, 10),
          game.isFavourite ? "yes" : "no",
          entry?.notes,
        ]
          .map(escapeCell)
          .join(","),
      );
    }
  }

  return rows.join("\r\n");
}

export function downloadCsv(filename: string, csv: string): void {
  // The BOM keeps Excel from mangling non-ASCII titles.
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}
