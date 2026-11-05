import { useEffect, useState } from "react";
import type { Game } from "../api/client";
import GameCard from "../components/GameCard";
import { sortGames, totalHours, type LibraryFilter } from "../lib/games";

interface Props {
  games: Game[];
  onOpen: (g: Game) => void;
  onSeeAll: (f: Partial<LibraryFilter>) => void;
}

export default function Dashboard({ games, onOpen, onSeeAll }: Props) {
  const [slide, setSlide] = useState(0);

  const slideshowGames = sortGames(
    games.filter((g) => g.coverUrl && totalHours(g) > 0),
    "recent",
  ).slice(0, 8);
  const count = slideshowGames.length;
  const active = count ? slide % count : 0; // stays valid if the list shrinks

  useEffect(() => {
    // No auto-advance under Reduce Motion
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setSlide((s) => (s + 1) % count), 4000);
    return () => clearInterval(timer);
  }, [count]);

  const totalGames = games.length;
  const completed = games.filter((g) => g.userEntries.some((e) => e.status === "Completed")).length;
  const playingGames = sortGames(
    games.filter((g) => g.userEntries.some((e) => e.status === "Playing")),
    "recent",
  );
  const hours = games.reduce((sum, g) => sum + totalHours(g), 0);
  const favourites = sortGames(
    games.filter((g) => g.isFavourite),
    "rating",
  );

  return (
    <>
      {/* Slideshow */}
      {count > 0 && (
        <div className="hero-slideshow">
          {slideshowGames.map((g, i) => (
            <button
              key={g.id}
              className={`slide ${i === active ? "active" : ""}`}
              inert={i !== active}
              onClick={() => onOpen(g)}
              aria-label={g.title}
            >
              <img src={g.coverUrl!} className="slide-bg" alt="" />
              <img src={g.coverUrl!} className="slide-cover" alt="" />
              <span className="slide-info">
                <span className="slide-title">{g.title}</span>
                <span className="slide-meta">
                  {g.releaseYear && <span>{g.releaseYear}</span>}
                  {g.userEntries[0] && <span className="slide-status">{g.userEntries[0].status.toUpperCase()}</span>}
                  {!!g.userEntries[0]?.hoursPlayed && <span>{g.userEntries[0].hoursPlayed}h played</span>}
                </span>
              </span>
            </button>
          ))}
          {count > 1 && (
            <div className="slide-dots">
              {slideshowGames.map((g, i) => (
                <button
                  key={g.id}
                  className={`slide-dot ${i === active ? "active" : ""}`}
                  onClick={() => setSlide(i)}
                  aria-label={`Show ${g.title}`}
                  aria-current={i === active}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Stats bar: each cell jumps to those games */}
      <div className="stats-bar">
        <button className="stat-cell" onClick={() => onSeeAll({})}>
          <div className="stat-value">{totalGames}</div>
          <div className="stat-label">Total Games</div>
        </button>
        <button className="stat-cell" onClick={() => onSeeAll({ sort: "hours" })}>
          <div className="stat-value">{Math.round(hours).toLocaleString()}</div>
          <div className="stat-label">Hours Played</div>
        </button>
        <button className="stat-cell" onClick={() => onSeeAll({ status: "Completed" })}>
          <div className="stat-value">{completed}</div>
          <div className="stat-label">Completed</div>
        </button>
        <button className="stat-cell" onClick={() => onSeeAll({ status: "Playing" })}>
          <div className="stat-value">{playingGames.length}</div>
          <div className="stat-label">Playing Now</div>
        </button>
      </div>

      {playingGames.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Currently Playing</span>
            <button className="btn btn-ghost" onClick={() => onSeeAll({ status: "Playing" })}>
              View all →
            </button>
          </div>
          <div className="games-grid">
            {playingGames.slice(0, 6).map((g) => (
              <GameCard key={g.id} game={g} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      {favourites.length > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Favourites</span>
            <button className="btn btn-ghost" onClick={() => onSeeAll({ status: "Favourites" })}>
              View all →
            </button>
          </div>
          <div className="games-grid">
            {favourites.slice(0, 6).map((g) => (
              <GameCard key={g.id} game={g} onOpen={onOpen} />
            ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">Recently Added</span>
          <button className="btn btn-ghost" onClick={() => onSeeAll({ sort: "added" })}>
            View all →
          </button>
        </div>
        <div className="games-grid">
          {sortGames(games, "added")
            .slice(0, 12)
            .map((g) => (
              <GameCard key={g.id} game={g} onOpen={onOpen} />
            ))}
        </div>
      </div>
    </>
  );
}
