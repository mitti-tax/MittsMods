import type { Game, PlayStatus } from "../api/client";
import { STATUSES, STATUS_LABEL, entryOf, familyOf, fmtHours } from "../lib/games";
import { usePlatform } from "../lib/platforms";

// A game box: cover, title, and a spine line coloured by console family
export default function GameCard({
  game,
  onOpen,
  onStatus,
}: {
  game: Game;
  onOpen: (g: Game) => void;
  onStatus?: (g: Game, s: PlayStatus) => void; // set = quick status editing
}) {
  const entry = entryOf(game);
  const platform = usePlatform(entry?.platformId);

  return (
    <article className="card" data-family={familyOf(entry?.platformId)}>
      <button className="card-open" onClick={() => onOpen(game)}>
        <Cover game={game} />
        <span className="card-title">{game.title}</span>
        <span className="card-meta">
          {platform && <span className="spine">{platform.abbreviation}</span>}
          {entry && !onStatus && (
            <span className={`status status-${entry.status}`}>{STATUS_LABEL[entry.status]}</span>
          )}
          {entry?.hoursPlayed ? <span className="card-hours">{fmtHours(entry.hoursPlayed)}</span> : null}
        </span>
      </button>
      {game.isFavourite && (
        <span className="fav-badge" role="img" aria-label="Favourite">
          ★
        </span>
      )}
      {entry && onStatus && (
        <select
          className="quick-status"
          aria-label={`Status of ${game.title}`}
          value={entry.status}
          onChange={(e) => onStatus(game, e.target.value as PlayStatus)}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      )}
    </article>
  );
}

// Box art, or a blank case with the title on it when there's no art
export function Cover({ game, className = "cover" }: { game: Game; className?: string }) {
  return game.coverUrl ? (
    <img className={className} src={game.coverUrl} alt="" loading="lazy" decoding="async" />
  ) : (
    <span className={`${className} cover-blank`} aria-hidden="true">
      {game.title}
    </span>
  );
}
