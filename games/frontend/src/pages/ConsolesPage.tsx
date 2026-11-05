import { useContext } from "react";
import type { Game } from "../api/client";
import Shelf from "../components/Shelf";
import { familyOf, sortGames, type LibraryFilter } from "../lib/games";
import { PlatformsContext } from "../lib/platforms";

const SHELF_SIZE = 12;

// One shelf per console, biggest collection first
export default function ConsolesPage({
  games,
  onOpen,
  onSeeAll,
}: {
  games: Game[];
  onOpen: (g: Game) => void;
  onSeeAll: (f: Partial<LibraryFilter>) => void;
}) {
  const platforms = useContext(PlatformsContext);
  const shelves = platforms
    .map((p) => {
      const onIt = games.filter((g) => g.userEntries.some((e) => e.platformId === p.id));
      const hours = Math.round(
        onIt.reduce((s, g) => s + g.userEntries.filter((e) => e.platformId === p.id).reduce((h, e) => h + (e.hoursPlayed ?? 0), 0), 0),
      );
      return { p, games: onIt, hours };
    })
    .filter((s) => s.games.length > 0)
    .sort((a, b) => b.games.length - a.games.length);

  return (
    <div className="page">
      <div className="page-head">
        <h1 className="page-title desktop-only">Consoles</h1>
      </div>
      {shelves.map(({ p, games: onIt, hours }) => (
        <Shelf
          key={p.id}
          title={p.name}
          family={familyOf(p.id)}
          detail={`${onIt.length} ${onIt.length === 1 ? "game" : "games"}${hours ? `, ${hours.toLocaleString()} hours` : ""}`}
          games={sortGames(onIt, "recent").slice(0, SHELF_SIZE)}
          onOpen={onOpen}
          onSeeAll={() => onSeeAll({ platformId: p.id })}
        />
      ))}
    </div>
  );
}
