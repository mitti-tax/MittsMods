import { useEffect, useState } from "react";
import type { Game } from "../api/client";
import Shelf from "../components/Shelf";
import { STATUS_LABEL, entryOf, fmtHours, sortGames, totalHours, type LibraryFilter } from "../lib/games";

interface Props {
  games: Game[];
  onOpen: (g: Game) => void;
  onSeeAll: (f: Partial<LibraryFilter>) => void;
}

const SHELF_SIZE = 12;

export default function Dashboard({ games, onOpen, onSeeAll }: Props) {
  const [slide, setSlide] = useState(0);

  // Recently played: games with art and play time, newest activity first
  const slideshowGames = sortGames(
    games.filter((g) => g.coverUrl && totalHours(g) > 0),
    "recent",
  ).slice(0, 8);
  const count = slideshowGames.length;
  const active = count ? slide % count : 0; // stays valid if the list shrinks

  useEffect(() => {
    if (count < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => setSlide((s) => (s + 1) % count), 5000);
    return () => clearInterval(timer);
  }, [count]);

  const playing = sortGames(
    games.filter((g) => g.userEntries.some((e) => e.status === "Playing")),
    "recent",
  );
  const favourites = sortGames(
    games.filter((g) => g.isFavourite),
    "rating",
  );
  const added = sortGames(games, "added");
  const topRated = sortGames(
    games.filter((g) => (entryOf(g)?.rating ?? 0) >= 8),
    "rating",
  );

  const consoles = new Set(games.flatMap((g) => g.userEntries.map((e) => e.platformId))).size;
  const hours = Math.round(games.reduce((s, g) => s + totalHours(g), 0));
  const finished = games.filter((g) => g.userEntries.some((e) => e.status === "Completed")).length;
  const n = (v: number) => <strong>{v.toLocaleString()}</strong>;

  return (
    <>
      {count > 0 && (
        <section className="hero" aria-label="Recently played">
          {slideshowGames.map((g, i) => {
            const e = entryOf(g);
            return (
              <button
                key={g.id}
                className={`slide ${i === active ? "active" : ""}`}
                inert={i !== active}
                onClick={() => onOpen(g)}
              >
                <img src={g.coverUrl!} className="slide-bg" alt="" />
                <img src={g.coverUrl!} className="slide-cover" alt="" />
                <span className="slide-info">
                  <span className="slide-kicker">Recently played</span>
                  <span className="slide-title">{g.title}</span>
                  <span className="slide-meta">
                    {e && <span className={`status status-${e.status}`}>{STATUS_LABEL[e.status]}</span>}
                    {e?.hoursPlayed ? <span>{fmtHours(e.hoursPlayed)} played</span> : null}
                    {g.releaseYear && <span>{g.releaseYear}</span>}
                  </span>
                </span>
              </button>
            );
          })}
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
        </section>
      )}

      <p className="tally">
        {n(games.length)} {games.length === 1 ? "game" : "games"} across {n(consoles)}{" "}
        {consoles === 1 ? "console" : "consoles"}, {n(hours)} hours logged and {n(finished)} finished
        {playing.length > 0 && <>, with {n(playing.length)} on the go right now</>}.
      </p>

      {playing.length > 0 && (
        <Shelf
          title="Now playing"
          games={playing.slice(0, SHELF_SIZE)}
          onOpen={onOpen}
          onSeeAll={() => onSeeAll({ status: "Playing" })}
        />
      )}
      {favourites.length > 0 && (
        <Shelf
          title="Favourites"
          games={favourites.slice(0, SHELF_SIZE)}
          onOpen={onOpen}
          onSeeAll={() => onSeeAll({ status: "Favourites" })}
        />
      )}
      <Shelf
        title="Recently added"
        games={added.slice(0, SHELF_SIZE)}
        onOpen={onOpen}
        onSeeAll={() => onSeeAll({ sort: "added" })}
      />
      {topRated.length > 0 && (
        <Shelf
          title="Rated 8 and up"
          games={topRated.slice(0, SHELF_SIZE)}
          onOpen={onOpen}
          onSeeAll={() => onSeeAll({ sort: "rating" })}
        />
      )}
    </>
  );
}
