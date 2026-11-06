import { useState } from "react";
import type { Game, PlayStatus } from "../api/client";
import GameCard from "../components/GameCard";
import { STATUSES, STATUS_LABEL, fmtHours, owned, playtimeTotal, totalHours, type LibraryFilter } from "../lib/games";

interface Props {
  games: Game[];
  onOpen: (g: Game) => void;
  onSeeAll: (f: Partial<LibraryFilter>) => void;
}

type Bar = { label: string; value: number; display?: string; className?: string; onClick?: () => void };

function Bars({ rows }: { rows: Bar[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="bars">
      {rows.map((r) => (
        <button key={r.label} className="bar-row" onClick={r.onClick} disabled={!r.onClick}>
          <span className="bar-label">{r.label}</span>
          <span className="bar-track">
            <span className={`bar-fill ${r.className ?? ""}`} style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 2 : 0 }} />
          </span>
          <span className="bar-value">{r.display ?? r.value.toLocaleString()}</span>
        </button>
      ))}
    </div>
  );
}

const yearOf = (s: string | null | undefined) => (s ? new Date(s).getFullYear() : null);

export default function Stats({ games: all, onOpen, onSeeAll }: Props) {
  const games = owned(all);
  const entries = games.flatMap((g) => g.userEntries.map((e) => ({ g, e })));
  const hours = games.reduce((s, g) => s + totalHours(g), 0);
  // Status counts include wishlist games (owned() leaves them out of everything else)
  const visible = all.filter((g) => !g.isHidden);
  const has = (s: PlayStatus) => visible.filter((g) => g.userEntries.some((e) => e.status === s));
  const completed = has("Completed");
  const backlog = has("Backlog");
  const started = games.filter((g) => g.userEntries.some((e) => e.status !== "Backlog"));

  // Hours by platform
  const byPlatform = new Map<string, { hours: number; id: number }>();
  for (const { e } of entries) {
    const p = byPlatform.get(e.platformName) ?? { hours: 0, id: e.platformId };
    p.hours += e.hoursPlayed ?? 0;
    byPlatform.set(e.platformName, p);
  }
  const genreCount = new Map<string, number>();
  for (const g of games) if (g.genre) genreCount.set(g.genre, (genreCount.get(g.genre) ?? 0) + 1);

  const mostPlayed = [...games].sort((a, b) => totalHours(b) - totalHours(a)).filter((g) => totalHours(g) > 0).slice(0, 10);

  // Year in review, from the dates logged when a game is started or finished
  const years = [
    ...new Set(
      entries.flatMap(({ e }) => [yearOf(e.startedAt), yearOf(e.completedAt)]),
    ),
  ]
    .filter((y): y is number => !!y)
    .sort((a, b) => b - a);
  const [year, setYear] = useState<number | null>(null);
  const shownYear = year ?? years[0] ?? new Date().getFullYear();
  const finishedIn = games.filter((g) => g.userEntries.some((e) => yearOf(e.completedAt) === shownYear));
  const startedIn = games.filter((g) => g.userEntries.some((e) => yearOf(e.startedAt) === shownYear));

  return (
    <>
      <div className="stats-bar">
        <button className="stat-cell" onClick={() => onSeeAll({})}>
          <div className="stat-value">{games.length}</div>
          <div className="stat-label">Games Owned</div>
        </button>
        <button className="stat-cell" onClick={() => onSeeAll({ sort: "hours" })}>
          <div className="stat-value">{Math.round(hours).toLocaleString()}</div>
          <div className="stat-label">Hours Played</div>
        </button>
        <button className="stat-cell" onClick={() => onSeeAll({ status: "Completed" })}>
          <div className="stat-value">{started.length ? Math.round((completed.length / started.length) * 100) : 0}%</div>
          <div className="stat-label">Finished Of Started</div>
        </button>
        <button className="stat-cell" onClick={() => onSeeAll({ status: "Backlog" })}>
          <div className="stat-value">{playtimeTotal(backlog) ? `~${Math.round(playtimeTotal(backlog)).toLocaleString()}h` : backlog.length}</div>
          <div className="stat-label">{playtimeTotal(backlog) ? "Backlog To Beat" : "In Backlog"}</div>
        </button>
      </div>

      <div className="stats-columns">
        <div className="section">
          <div className="section-header">
            <span className="section-title">Status</span>
          </div>
          <Bars
            rows={STATUSES.map((s) => ({
              label: STATUS_LABEL[s],
              value: has(s).length,
              className: `status-${s}`,
              onClick: () => onSeeAll({ status: s }),
            }))}
          />
        </div>

        <div className="section">
          <div className="section-header">
            <span className="section-title">Hours By Platform</span>
          </div>
          <Bars
            rows={[...byPlatform]
              .sort((a, b) => b[1].hours - a[1].hours)
              .map(([label, p]) => ({
                label,
                value: p.hours,
                display: fmtHours(p.hours) || "0h",
                onClick: () => onSeeAll({ platformId: p.id, sort: "hours" }),
              }))}
          />
        </div>

        <div className="section">
          <div className="section-header">
            <span className="section-title">Top Genres</span>
          </div>
          {genreCount.size ? (
            <Bars
              rows={[...genreCount]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([label, n]) => ({ label, value: n, onClick: () => onSeeAll({ genre: label }) }))}
            />
          ) : (
            <p className="empty-state-sub">No genres yet. They come from IGDB.</p>
          )}
        </div>

        <div className="section">
          <div className="section-header">
            <span className="section-title">Most Played</span>
          </div>
          <ol className="rank-list">
            {mostPlayed.map((g) => (
              <li key={g.id}>
                <button onClick={() => onOpen(g)}>
                  <span className="rank-title">{g.title}</span>
                  <span className="rank-value">{fmtHours(totalHours(g))}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="section">
        <div className="section-header">
          <span className="section-title">Year In Review</span>
        </div>
        {years.length > 1 && (
          <div className="filter-bar year-chips" role="group" aria-label="Year">
            {years.map((y) => (
              <button key={y} className={`filter-chip ${y === shownYear ? "active" : ""}`} aria-pressed={y === shownYear} onClick={() => setYear(y)}>
                {y}
              </button>
            ))}
          </div>
        )}
        {finishedIn.length || startedIn.length ? (
          <>
            <div className="result-count">
              {shownYear}: {finishedIn.length} FINISHED · {startedIn.length} STARTED
            </div>
            {finishedIn.length > 0 && (
              <div className="games-grid">
                {finishedIn.map((g) => (
                  <GameCard key={g.id} game={g} onOpen={onOpen} />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="empty-state-sub">
            Nothing logged for {shownYear} yet. Dates fill in by themselves when a game is set to Playing or Completed.
          </p>
        )}
      </div>
    </>
  );
}
