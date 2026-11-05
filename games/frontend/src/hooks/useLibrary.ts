import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  type CreateGamePayload,
  type Game,
  type Platform,
  type UpdateEntryPayload,
  type UserEntry,
} from "../api/client";

// One copy of the library for every page; writes patch it in place
export function useLibrary(notify: (msg: string, ok?: boolean) => void) {
  const [games, setGames] = useState<Game[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  // A reload (after a Steam sync) keeps the current shelf on screen instead of flashing a loader
  const loaded = useRef(false);
  const load = useCallback(() => {
    Promise.all([api.getGames(), api.getPlatforms()])
      .then(([g, p]) => {
        setGames(g);
        setPlatforms(p);
        setState("ready");
        loaded.current = true;
      })
      .catch(() => {
        if (loaded.current) notify("Couldn't refresh the library. Showing what was loaded before.", false);
        else setState("error");
      });
  }, [notify]);

  useEffect(load, [load]);

  const retry = () => {
    setState("loading");
    load();
  };

  const replace = (g: Game) => setGames((prev) => prev.map((x) => (x.id === g.id ? g : x)));

  const add = async (p: CreateGamePayload) => {
    try {
      const g = await api.createGame(p);
      setGames((prev) => [...prev, g]);
      notify(`Added ${g.title}`);
      return true;
    } catch {
      notify("Couldn't add the game. Check you're still logged in and try again.", false);
      return false;
    }
  };

  const update = async (g: Game, e: UserEntry, changes: UpdateEntryPayload, quiet = false) => {
    try {
      replace(await api.updateEntry(g.id, e, changes));
      if (!quiet) notify(`Saved ${g.title}`);
      return true;
    } catch {
      notify(`Couldn't save ${g.title}. Try again.`, false);
      return false;
    }
  };

  const remove = async (g: Game) => {
    try {
      await api.deleteGame(g.id);
      setGames((prev) => prev.filter((x) => x.id !== g.id));
      notify(`Deleted ${g.title}`);
      return true;
    } catch {
      notify(`Couldn't delete ${g.title}. Try again.`, false);
      return false;
    }
  };

  const toggleFavourite = async (g: Game) => {
    try {
      replace(await api.toggleFavourite(g.id));
    } catch {
      notify("Couldn't update favourites. Try again.", false);
    }
  };

  return { games, platforms, state, load, retry, add, update, remove, toggleFavourite };
}
