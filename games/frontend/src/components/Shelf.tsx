import type { ReactNode } from "react";
import type { Game } from "../api/client";
import GameCard from "./GameCard";

// A titled, horizontally scrolling row of game boxes
export default function Shelf({
  title,
  detail,
  family,
  games,
  onOpen,
  onSeeAll,
}: {
  title: string;
  detail?: ReactNode;
  family?: string;
  games: Game[];
  onOpen: (g: Game) => void;
  onSeeAll?: () => void;
}) {
  return (
    <section className="shelf" data-family={family}>
      <header className="shelf-head">
        <div>
          <h2 className="shelf-title">{title}</h2>
          {detail && <p className="shelf-detail">{detail}</p>}
        </div>
        {onSeeAll && (
          <button className="link-btn" onClick={onSeeAll}>
            See all
          </button>
        )}
      </header>
      <div className="shelf-row">
        {games.map((g) => (
          <GameCard key={g.id} game={g} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}
