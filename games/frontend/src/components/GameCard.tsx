import type { Game, PlayStatus } from "../api/client";
import { STATUSES, STATUS_LABEL, entryOf, fmtHours } from "../lib/games";

export default function GameCard({
  game,
  onOpen,
  onStatus,
}: {
  game: Game;
  onOpen: (g: Game) => void;
  onStatus?: (g: Game, s: PlayStatus) => void; // set = edit mode
}) {
  const entry = entryOf(game);
  return (
    <div
      className="game-card"
      role="button"
      tabIndex={0}
      aria-label={game.title}
      onClick={() => onOpen(game)}
      onKeyDown={(e) => {
        // Ignore keys typed into the quick-status select inside the card
        if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onOpen(game);
        }
      }}
    >
      {game.coverUrl ? (
        <img src={game.coverUrl} className="game-card-cover" alt="" loading="lazy" decoding="async" />
      ) : (
        <div className="game-card-cover-placeholder">🎮</div>
      )}
      {game.isFavourite && (
        <span className="fav-star" role="img" aria-label="Favourite">
          ★
        </span>
      )}
      <div className="game-card-body">
        <div className="game-card-title">{game.title}</div>
        {entry && (
          <div className="game-card-meta">
            {onStatus ? (
              <select
                className="quick-status-select"
                aria-label={`Status of ${game.title}`}
                value={entry.status}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => onStatus(game, e.target.value as PlayStatus)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`status-badge status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
            )}
            {entry.hoursPlayed ? <span className="game-card-hours">{fmtHours(entry.hoursPlayed)}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
