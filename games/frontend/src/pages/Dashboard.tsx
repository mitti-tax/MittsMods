import { useEffect, useState } from "react";
import { api, type Game } from "../api/client";

interface Props {
  onNavigate: (page: "dashboard" | "games" | "backlog") => void;
  isLoggedIn: boolean;
}

export default function Dashboard({ onNavigate }: Props) {
  const [games, setGames] = useState<Game[]>([]);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    api.getGames().then(setGames).catch(console.error);
  }, []);

  const slideshowGames = games
    .filter(
      (g) =>
        g.coverUrl &&
        g.userEntries.some((e) => e.hoursPlayed && e.hoursPlayed > 0),
    )
    .sort((a, b) => {
      const aDate = new Date(a.userEntries[0]?.updatedAt ?? 0).getTime();
      const bDate = new Date(b.userEntries[0]?.updatedAt ?? 0).getTime();
      return bDate - aDate;
    })
    .slice(0, 8);

  const totalGames = games.length;
  const completed = games.filter((g) =>
    g.userEntries.some((e) => e.status === "Completed"),
  ).length;
  const playing = games.filter((g) =>
    g.userEntries.some((e) => e.status === "Playing"),
  ).length;
  const totalHours = games.reduce(
    (sum, g) =>
      sum + g.userEntries.reduce((s, e) => s + (e.hoursPlayed ?? 0), 0),
    0,
  );

  return (
    <>
      {/* Slideshow */}
      <div className="hero-slideshow">
        {slideshowGames.length === 0 ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
            }}
          >
            <div className="empty-state">
              <p>NO GAMES LOGGED YET</p>
              <p style={{ fontSize: "11px", marginTop: "8px" }}>
                Log in and use Sync Steam to import your library
              </p>
            </div>
          </div>
        ) : (
          <>
            {slideshowGames.map((g, i) => (
              <div
                key={g.id}
                className={`slide ${i === slide ? "active" : ""}`}
              >
                <img src={g.coverUrl!} className="slide-bg" alt="" />
                <img src={g.coverUrl!} className="slide-cover" alt={g.title} />
                <div className="slide-info">
                  <div className="slide-title">{g.title}</div>
                  <div className="slide-meta">
                    {g.releaseYear && <span>{g.releaseYear}</span>}
                    {g.userEntries[0] && (
                      <span className="slide-status">
                        {g.userEntries[0].status.toUpperCase()}
                      </span>
                    )}
                    {g.userEntries[0]?.hoursPlayed && (
                      <span>{g.userEntries[0].hoursPlayed}h played</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div className="slide-dots">
              {slideshowGames.map((_, i) => (
                <button
                  key={i}
                  className={`slide-dot ${i === slide ? "active" : ""}`}
                  onClick={() => setSlide(i)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Stats bar */}
      <div className="stats-bar">
        <div className="stat-cell">
          <div className="stat-value">{totalGames}</div>
          <div className="stat-label">Total Games</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value">{Math.round(totalHours)}</div>
          <div className="stat-label">Hours Played</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value">{completed}</div>
          <div className="stat-label">Completed</div>
        </div>
        <div className="stat-cell">
          <div className="stat-value">{playing}</div>
          <div className="stat-label">Playing Now</div>
        </div>
      </div>

      {playing > 0 && (
        <div className="section">
          <div className="section-header">
            <span className="section-title">Currently Playing</span>
            <button
              className="btn btn-ghost"
              onClick={() => onNavigate("games")}
            >
              All Games →
            </button>
          </div>
          <div className="games-grid">
            {games
              .filter((g) => g.userEntries.some((e) => e.status === "Playing"))
              .slice(0, 6)
              .map((g) => (
                <GameCard key={g.id} game={g} />
              ))}
          </div>
        </div>
      )}

      <div className="section">
        <div className="section-header">
          <span className="section-title">Recently Added</span>
          <button className="btn btn-ghost" onClick={() => onNavigate("games")}>
            View all →
          </button>
        </div>
        <div className="games-grid">
          {[...games]
            .sort(
              (a, b) =>
                new Date(b.createdAt).getTime() -
                new Date(a.createdAt).getTime(),
            )
            .slice(0, 12)
            .map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
        </div>
      </div>
    </>
  );
}

function GameCard({ game }: { game: Game }) {
  const entry = game.userEntries[0];
  return (
    <div className="game-card">
      {game.coverUrl ? (
        <img src={game.coverUrl} className="game-card-cover" alt={game.title} />
      ) : (
        <div className="game-card-cover-placeholder">🎮</div>
      )}
      <div className="game-card-body">
        <div className="game-card-title">{game.title}</div>
        {entry && (
          <div className="game-card-meta">
            <span className={`status-badge status-${entry.status}`}>
              {entry.status}
            </span>
            {entry.hoursPlayed ? (
              <span className="game-card-hours">{entry.hoursPlayed}h</span>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
