import { memo } from "react";
import type { GameListItem, PlayStatus } from "../api/client";
import CoverImage from "./CoverImage";
import { STATUSES, formatHours, primaryEntry, statusLabel, totalHours } from "../lib/game";

interface Props {
  game: GameListItem;
  /** Shows the inline status dropdown instead of the badge. */
  editMode?: boolean;
  canFavourite?: boolean;
  eagerCover?: boolean;
  onOpen: (game: GameListItem) => void;
  onQuickStatus?: (game: GameListItem, status: PlayStatus) => void;
  onToggleFavourite?: (game: GameListItem) => void;
}

function GameCard({
  game,
  editMode = false,
  canFavourite = false,
  eagerCover = false,
  onOpen,
  onQuickStatus,
  onToggleFavourite,
}: Props) {
  const entry = primaryEntry(game);
  const hours = formatHours(totalHours(game));
  const extraPlatforms = game.userEntries.length - 1;

  return (
    <article className="game-card">
      {/* Mouse users can click the art; keyboard users get the title button. */}
      <div className="game-card-cover-wrap" onClick={() => onOpen(game)}>
        <CoverImage
          src={game.coverUrl}
          alt={`${game.title} cover art`}
          className="game-card-cover"
          eager={eagerCover}
        />

        {game.isFavourite && !canFavourite && (
          <span className="game-card-flag" aria-label="Favourite" title="Favourite">
            ★
          </span>
        )}

        {canFavourite && onToggleFavourite && (
          <button
            type="button"
            className={`fav-btn${game.isFavourite ? " is-on" : ""}`}
            aria-pressed={game.isFavourite}
            aria-label={
              game.isFavourite
                ? `Remove ${game.title} from favourites`
                : `Add ${game.title} to favourites`
            }
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavourite(game);
            }}
          >
            ★
          </button>
        )}

        {extraPlatforms > 0 && (
          <span className="game-card-flag game-card-platforms">
            +{extraPlatforms}
          </span>
        )}
      </div>

      <div className="game-card-body">
        <button type="button" className="game-card-title" onClick={() => onOpen(game)}>
          {game.title}
        </button>

        {entry && (
          <div className="game-card-meta">
            {editMode && onQuickStatus ? (
              <select
                className="quick-status-select"
                value={entry.status}
                aria-label={`Status for ${game.title}`}
                onClick={(event) => event.stopPropagation()}
                onChange={(event) => {
                  event.stopPropagation();
                  onQuickStatus(game, event.target.value as PlayStatus);
                }}
              >
                {STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {statusLabel(status)}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`status-badge status-${entry.status}`}>
                {statusLabel(entry.status)}
              </span>
            )}

            {hours && <span className="game-card-hours">{hours}</span>}
          </div>
        )}
      </div>
    </article>
  );
}

export default memo(GameCard);
