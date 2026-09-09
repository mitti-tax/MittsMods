import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, api } from "../api/client";
import type { GameListItem, LibraryStats } from "../api/client";
import type { RouteParams } from "../hooks/useHashRoute";
import GameCard from "../components/GameCard";
import CoverImage from "../components/CoverImage";
import { formatHours, primaryEntry, statusLabel, totalHours } from "../lib/game";

const SLIDE_INTERVAL_MS = 6000;
const SLIDE_COUNT = 8;

interface Props {
  onNavigate: (path: string, params?: RouteParams) => void;
}

interface DashboardData {
  stats: LibraryStats;
  recentlyPlayed: GameListItem[];
  playing: GameListItem[];
  recentlyAdded: GameListItem[];
}

export default function Dashboard({ onNavigate }: Props) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    // Four small, indexed queries instead of downloading the whole library
    // and reducing it in the browser.
    Promise.all([
      api.getStats(controller.signal),
      api.getGames(
        { sort: "played", minHours: 0.1, pageSize: SLIDE_COUNT },
        controller.signal,
      ),
      api.getGames({ status: "Playing", sort: "played", pageSize: 6 }, controller.signal),
      api.getGames({ sort: "added", pageSize: 12 }, controller.signal),
    ])
      .then(([stats, recentlyPlayed, playing, recentlyAdded]) => {
        setData({
          stats,
          recentlyPlayed: recentlyPlayed.items.filter((game) => game.coverUrl),
          playing: playing.items,
          recentlyAdded: recentlyAdded.items,
        });
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setLoading(false);
        setError(
          cause instanceof ApiError
            ? cause.message
            : "Could not load the dashboard.",
        );
      });

    return () => controller.abort();
  }, [reloadKey]);

  const openGame = useCallback(
    (game: GameListItem) => onNavigate("/library", { game: game.id }),
    [onNavigate],
  );

  if (error) {
    return (
      <div className="empty-state">
        <p>{error}</p>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setError(null);
            setLoading(true);
            setReloadKey((key) => key + 1);
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  if (loading && !data) {
    return <div className="loading">LOADING…</div>;
  }

  if (!data) return null;

  const { stats, recentlyPlayed, playing, recentlyAdded } = data;

  // The hero only earns its 420px when it has something to show. A library
  // with games but nothing played yet skips it rather than claiming
  // "no games logged" above a stats bar that says otherwise.
  const showHero = recentlyPlayed.length > 0 || stats.totalGames === 0;

  return (
    <>
      {showHero && <Slideshow games={recentlyPlayed} onOpen={openGame} />}

      <div className="stats-bar">
        <Stat value={stats.totalGames} label="Total Games" />
        <Stat value={Math.round(stats.totalHours)} label="Hours Played" />
        <Stat value={stats.gamesByStatus.Completed ?? 0} label="Completed" />
        <Stat value={stats.gamesByStatus.Playing ?? 0} label="Playing Now" />
      </div>

      <div className="stats-bar stats-bar-secondary">
        <Stat value={stats.gamesByStatus.Backlog ?? 0} label="Backlog" />
        <Stat value={stats.favourites} label="Favourites" />
        <Stat
          value={stats.averageRating === null ? "—" : stats.averageRating.toFixed(1)}
          label="Avg Rating"
        />
        <Stat
          value={
            stats.achievementsTotal > 0
              ? `${stats.achievementsEarned}/${stats.achievementsTotal}`
              : "—"
          }
          label="Achievements"
        />
      </div>

      {playing.length > 0 && (
        <Section
          title="Currently Playing"
          actionLabel="All games →"
          onAction={() => onNavigate("/library")}
        >
          <div className="games-grid">
            {playing.map((game, index) => (
              <GameCard
                key={game.id}
                game={game}
                eagerCover={index < 6}
                onOpen={openGame}
              />
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Recently Added"
        actionLabel="View all →"
        onAction={() => onNavigate("/library", { sort: "added" })}
      >
        {recentlyAdded.length === 0 ? (
          <p className="field-hint">Nothing logged yet.</p>
        ) : (
          <div className="games-grid">
            {recentlyAdded.map((game) => (
              <GameCard key={game.id} game={game} onOpen={openGame} />
            ))}
          </div>
        )}
      </Section>

      {stats.topPlatforms.length > 0 && (
        <Section title="Top Platforms">
          <ul className="platform-stats">
            {stats.topPlatforms.map((platform) => (
              <li key={platform.platformId}>
                <button
                  type="button"
                  className="platform-stat"
                  onClick={() =>
                    onNavigate("/library", { platform: platform.platformId })
                  }
                >
                  <span className="platform-stat-name">{platform.platformName}</span>
                  <span className="platform-stat-meta">
                    {platform.games} {platform.games === 1 ? "game" : "games"}
                    {formatHours(platform.hours) ? ` · ${formatHours(platform.hours)}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}

function Stat({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="stat-cell">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function Section({
  title,
  actionLabel,
  onAction,
  children,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="section">
      <div className="section-header">
        <h2 className="section-title">{title}</h2>
        {actionLabel && onAction && (
          <button type="button" className="btn btn-ghost" onClick={onAction}>
            {actionLabel}
          </button>
        )}
      </div>
      {children}
    </section>
  );
}

function Slideshow({
  games,
  onOpen,
}: {
  games: GameListItem[];
  onOpen: (game: GameListItem) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduceMotion = usePrefersReducedMotion();

  const count = games.length;
  // Derived, so a shrinking list can never leave the index out of range.
  const current = count === 0 ? 0 : index % count;

  useEffect(() => {
    if (count < 2 || paused || reduceMotion) return;

    const timer = setInterval(
      () => setIndex((value) => (value + 1) % count),
      SLIDE_INTERVAL_MS,
    );

    return () => clearInterval(timer);
  }, [count, paused, reduceMotion]);

  if (count === 0) {
    return (
      <div className="hero-slideshow hero-empty">
        <div className="empty-state">
          <p>NO GAMES LOGGED YET</p>
          <p className="empty-note">
            Log in and use Sync Steam to import your library
          </p>
        </div>
      </div>
    );
  }

  const step = (delta: number) =>
    setIndex((value) => (value + delta + count) % count);

  return (
    <section
      className="hero-slideshow"
      aria-label="Recently played"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      {games.map((game, slideIndex) => {
        const entry = primaryEntry(game);
        const hours = formatHours(totalHours(game));
        const active = slideIndex === current;

        return (
          <div
            className={`slide ${active ? "active" : ""}`}
            key={game.id}
            aria-hidden={!active}
            inert={!active}
          >
            <CoverImage
              src={game.coverUrl}
              alt=""
              className="slide-bg"
              eager={slideIndex === 0}
            />
            <button
              type="button"
              className="slide-cover-btn"
              onClick={() => onOpen(game)}
              tabIndex={active ? 0 : -1}
            >
              <CoverImage
                src={game.coverUrl}
                alt={`${game.title} — open details`}
                className="slide-cover"
                eager={slideIndex === 0}
              />
            </button>
            <div className="slide-info">
              <div className="slide-title">{game.title}</div>
              <div className="slide-meta">
                {game.releaseYear && <span>{game.releaseYear}</span>}
                {entry && (
                  <span className="slide-status">
                    {statusLabel(entry.status).toUpperCase()}
                  </span>
                )}
                {hours && <span>{hours} played</span>}
              </div>
            </div>
          </div>
        );
      })}

      {count > 1 && (
        <>
          <button
            type="button"
            className="slide-nav slide-prev"
            aria-label="Previous game"
            onClick={() => step(-1)}
          >
            ‹
          </button>
          <button
            type="button"
            className="slide-nav slide-next"
            aria-label="Next game"
            onClick={() => step(1)}
          >
            ›
          </button>

          <div className="slide-dots" role="tablist" aria-label="Choose a game">
            {games.map((game, dotIndex) => (
              <button
                key={game.id}
                type="button"
                role="tab"
                aria-selected={dotIndex === current}
                aria-label={game.title}
                className={`slide-dot ${dotIndex === current ? "active" : ""}`}
                onClick={() => setIndex(dotIndex)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/** Honours the OS "reduce motion" setting by holding the slideshow still. */
function usePrefersReducedMotion(): boolean {
  const query = useMemo(
    () =>
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null,
    [],
  );

  const [reduced, setReduced] = useState(() => query?.matches ?? false);

  useEffect(() => {
    if (!query) return;
    const handleChange = () => setReduced(query.matches);
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [query]);

  return reduced;
}
