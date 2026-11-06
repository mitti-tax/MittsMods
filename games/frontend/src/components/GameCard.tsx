import type { Game, PlayStatus } from "../api/client";
import { STATUSES, STATUS_LABEL, entryOf, fmtHours, totalHours } from "../lib/games";
import Cover from "./Cover";

export default function GameCard({
  game,
  onOpen,
  onStatus,
  selected,
}: {
  game: Game;
  onOpen: (g: Game) => void; // in edit mode this toggles selection
  onStatus?: (g: Game, s: PlayStatus) => void; // set = edit mode
  selected?: boolean;
}) {
  const entry = entryOf(game);
  const selecting = selected !== undefined;
  const hours = totalHours(game); // every platform, matching the Most played sort
  return (
    <div
      className={`game-card ${selected ? "selected" : ""} ${game.isHidden ? "is-hidden" : ""}`}
      role={selecting ? "checkbox" : "button"}
      aria-checked={selecting ? selected : undefined}
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
      <Cover src={game.coverUrl} className="game-card-cover" />
      {selecting && <span className="select-mark" aria-hidden="true">{selected ? "✓" : ""}</span>}
      {game.isFavourite && !selecting && (
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
            {hours ? <span className="game-card-hours">{fmtHours(hours)}</span> : null}
          </div>
        )}
      </div>
    </div>
  );
}
