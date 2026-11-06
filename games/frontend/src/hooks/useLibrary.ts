import { useCallback, useEffect, useRef, useState } from "react";
import {
  api,
  ApiError,
  type CreateGamePayload,
  type Game,
  type GameDetails,
  type NewEntryPayload,
  type Platform,
  type PlayStatus,
  type UpdateEntryPayload,
  type UserEntry,
} from "../api/client";
import { STATUS_LABEL, entryOf } from "../lib/games";

export type Notify = (msg: string, ok?: boolean, undo?: () => void) => void;

// The last library loaded is kept on the device: the app opens instantly and works offline
const CACHE_KEY = "gamelog_library_v1";
type Cache = { games: Game[]; platforms: Platform[] };
const readCache = (): Cache | null => {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
    return Array.isArray(c?.games) && Array.isArray(c?.platforms) ? c : null;
  } catch {
    return null;
  }
};

const plural = (n: number, word: string) => (n === 1 ? `1 ${word}` : `${n} ${word}s`);

// One copy of the library for every page; writes show up at once and roll back if they fail
export function useLibrary(notify: Notify) {
  const [cache] = useState(readCache);
  const [games, setGames] = useState<Game[]>(cache?.games ?? []);
  const [platforms, setPlatforms] = useState<Platform[]>(cache?.platforms ?? []);
  const [state, setState] = useState<"loading" | "ready" | "error">(cache ? "ready" : "loading");
  const [refreshing, setRefreshing] = useState(true); // the first load starts straight away

  // After the first load, a failed refresh keeps what's on screen instead of an error page
  const loaded = useRef(!!cache);
  const fetchAll = useCallback(() => {
    return Promise.all([api.getGames(), api.getPlatforms()])
      .then(([g, p]) => {
        setGames(g);
        setPlatforms(p);
        setState("ready");
        loaded.current = true;
      })
      .catch(() => {
        if (loaded.current) notify("Couldn't reach the server. Showing the library saved on this device.", false);
        else setState("error");
      })
      .finally(() => setRefreshing(false));
  }, [notify]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const load = () => {
    setRefreshing(true);
    return fetchAll();
  };

  useEffect(() => {
    if (state !== "ready") return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ games, platforms }));
    } catch {
      // Storage full or blocked: the app still works, it just won't open offline
    }
  }, [games, platforms, state]);

  const retry = () => {
    setState("loading");
    load();
  };

  const replaceMany = (fresh: Game[]) => {
    const byId = new Map(fresh.map((g) => [g.id, g]));
    setGames((prev) => prev.map((x) => byId.get(x.id) ?? x));
  };
  const replace = (g: Game) => replaceMany([g]);
  const patch = (ids: number[], fn: (g: Game) => Game) => {
    const set = new Set(ids);
    setGames((prev) => prev.map((g) => (set.has(g.id) ? fn(g) : g)));
  };
  // Puts the given copies back exactly as they were (undoing an optimistic change)
  const restore = (before: Game[]) => replaceMany(before);

  const add = async (p: CreateGamePayload) => {
    try {
      const g = await api.createGame(p);
      setGames((prev) => [...prev, g]);
      notify(`Added ${g.title}`);
      return true;
    } catch (e) {
      const dupe = e instanceof ApiError && e.status === 409;
      notify(dupe ? "That Steam game is already in the library." : "Couldn't add the game. Check you're still logged in and try again.", false);
      return false;
    }
  };

  const update = async (g: Game, e: UserEntry, changes: UpdateEntryPayload, quiet = false) => {
    patch([g.id], (x) => ({
      ...x,
      userEntries: x.userEntries.map((y) => (y.id === e.id ? { ...y, ...changes } : y)),
    }));
    try {
      replace(await api.updateEntry(g.id, e, changes));
      if (!quiet) notify(`Saved ${g.title}`);
      return true;
    } catch {
      restore([g]);
      notify(`Couldn't save ${g.title}. Try again.`, false);
      return false;
    }
  };

  // Undo puts each game's main entry back exactly as it was, start/finish dates included
  const revertEntries = async (list: Game[]) => {
    restore(list);
    try {
      for (let i = 0; i < list.length; i += 10) {
        const batch = list.slice(i, i + 10).flatMap((g) => {
          const e = entryOf(g);
          return e ? [api.updateEntry(g.id, e, {})] : [];
        });
        replaceMany(await Promise.all(batch));
      }
    } catch {
      load(); // show what the server actually has
      notify("Couldn't undo everything. Check the statuses and try again.", false);
    }
  };

  // Changes each game's main (first) entry, the one its card shows; the API does the same
  const setStatus = async (list: Game[], status: PlayStatus) => {
    const ids = list.map((g) => g.id);
    patch(ids, (g) => ({ ...g, userEntries: g.userEntries.map((e, i) => (i === 0 ? { ...e, status } : e)) }));
    try {
      replaceMany(await api.bulk({ ids, status }));
      const what = list.length === 1 ? list[0].title : plural(list.length, "game");
      notify(`${what} moved to ${STATUS_LABEL[status]}`, true, () => revertEntries(list));
      return true;
    } catch {
      restore(list);
      notify("Couldn't change the status. Try again.", false);
      return false;
    }
  };

  const setPlatform = async (list: Game[], platformId: number) => {
    try {
      const fresh = await api.bulk({ ids: list.map((g) => g.id), platformId });
      replaceMany(fresh);
      // The API skips Steam entries (always PC) and games already logged on that platform
      const moved = fresh.filter((g) => entryOf(g)?.platformId === platformId).length;
      const name = platforms.find((p) => p.id === platformId)?.name ?? "that platform";
      const skipped = list.length - moved;
      notify(`${plural(moved, "game")} moved to ${name}${skipped ? `, ${skipped} skipped` : ""}`);
      return true;
    } catch {
      notify("Couldn't change the platform. Try again.", false);
      return false;
    }
  };

  const setHidden = async (list: Game[], hidden: boolean, withUndo = true) => {
    const ids = list.map((g) => g.id);
    patch(ids, (g) => ({ ...g, isHidden: hidden }));
    try {
      replaceMany(await api.bulk({ ids, hidden }));
      const what = list.length === 1 ? list[0].title : plural(list.length, "game");
      notify(
        hidden ? `Hid ${what}` : `${what} is back in the library`,
        true,
        withUndo ? () => setHidden(list, !hidden, false) : undefined,
      );
      return true;
    } catch {
      // Back to how it was before this call (list may hold older copies, e.g. when undoing)
      patch(ids, (g) => ({ ...g, isHidden: !hidden }));
      notify(hidden ? "Couldn't hide that. Try again." : "Couldn't unhide that. Try again.", false);
      return false;
    }
  };

  // Manual games are deleted for good; Steam games are hidden so a sync doesn't re-add them
  const remove = async (g: Game) => {
    if (g.steamAppId) return setHidden([g], true);
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
    patch([g.id], (x) => ({ ...x, isFavourite: !x.isFavourite }));
    try {
      replace(await api.toggleFavourite(g.id));
    } catch {
      restore([g]);
      notify("Couldn't update favourites. Try again.", false);
    }
  };

  const updateDetails = async (g: Game, d: GameDetails) => {
    try {
      replace(await api.updateGame(g.id, d));
      notify(`Saved ${d.title}`);
      return true;
    } catch {
      notify("Couldn't save the details. Try again.", false);
      return false;
    }
  };

  const addEntry = async (g: Game, p: NewEntryPayload) => {
    try {
      replace(await api.addEntry(g.id, p));
      notify(`Added a platform to ${g.title}`);
      return true;
    } catch (e) {
      const dupe = e instanceof ApiError && e.status === 409;
      notify(dupe ? `${g.title} is already logged on that platform.` : "Couldn't add the platform. Try again.", false);
      return false;
    }
  };

  const removeEntry = async (g: Game, e: UserEntry) => {
    try {
      replace(await api.deleteEntry(g.id, e.id));
      notify(`Removed ${e.platformName} from ${g.title}`);
      return true;
    } catch {
      notify("Couldn't remove that platform. Try again.", false);
      return false;
    }
  };

  return {
    games, platforms, state, refreshing, load, retry, add, update, setStatus, setPlatform, setHidden,
    remove, toggleFavourite, updateDetails, addEntry, removeEntry,
  };
}

export type Library = ReturnType<typeof useLibrary>;
