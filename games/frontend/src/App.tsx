import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Game } from "./api/client";
import AddGameSheet from "./components/AddGameSheet";
import GameSheet from "./components/GameSheet";
import LoginModal from "./components/LoginModal";
import PickSheet from "./components/PickSheet";
import { EmptyLibrary, ErrorState, LoadingState } from "./components/States";
import { useAuth } from "./hooks/useAuth";
import { useSheet } from "./hooks/useSheet";
import { useLibrary } from "./hooks/useLibrary";
import { DEFAULT_FILTER, filterFromParams, filterToParams, toCsv, type LibraryFilter } from "./lib/games";
import Dashboard from "./pages/Dashboard";
import GamesPage from "./pages/GamesPage";
import Stats from "./pages/Stats";
import "./index.css";

type Page = "dashboard" | "games" | "backlog" | "stats";

const PAGE_TITLES: Record<Page, string> = {
  dashboard: "GameLog",
  games: "All Games",
  backlog: "Backlog",
  stats: "Stats",
};

const TABS: { page: Page; label: string; icon: string }[] = [
  { page: "dashboard", label: "Home", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { page: "games", label: "Games", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { page: "backlog", label: "Backlog", icon: "M6 3h12v18l-6-4-6 4z" },
  { page: "stats", label: "Stats", icon: "M4 20V10h4v10zM10 20V4h4v16zM16 20v-7h4v7z" },
];

const BASE_FILTER: Partial<Record<Page, LibraryFilter>> = {
  games: DEFAULT_FILTER,
  backlog: { ...DEFAULT_FILTER, status: "Backlog" },
};

// Everything lives in the URL hash (#/games?status=Completed&game=12): refresh, Back and links work
interface Route {
  page: Page;
  params: URLSearchParams;
}
const parseRoute = (): Route => {
  const [p, q = ""] = window.location.hash.replace(/^#\/?/, "").split("?");
  return { page: p in PAGE_TITLES ? (p as Page) : "dashboard", params: new URLSearchParams(q) };
};
// String(params), not params.size: .size is missing before Safari 17 (iOS 16)
const hashOf = (r: Route) => {
  const q = String(r.params);
  return `#/${r.page}${q ? `?${q}` : ""}`;
};
const without = (p: URLSearchParams, key: string) => {
  const next = new URLSearchParams(p);
  next.delete(key);
  return next;
};

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const [showAdd, setShowAdd] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [showPick, setShowPick] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error"; id: number; undo?: () => void } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchRef = useRef<HTMLInputElement>(null);

  // One toast at a time; a new one restarts the timer instead of being cut short
  const notify = useCallback((msg: string, ok = true, undo?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type: ok ? "success" : "error", id: Date.now(), undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : ok ? 3000 : 5000);
  }, []);

  const { isLoggedIn, login, logout } = useAuth();
  const lib = useLibrary(notify);
  const page = route.page;
  const openId = Number(route.params.get("game")) || null;
  const open = lib.games.find((g) => g.id === openId); // always the latest copy

  // iOS large title: nav bar shows the small title once the large one scrolls away
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Back/forward and hand-edited hashes
  useEffect(() => {
    const sync = () => setRoute(parseRoute());
    window.addEventListener("popstate", sync);
    window.addEventListener("hashchange", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("hashchange", sync);
    };
  }, []);

  // Each tab remembers its filters, like an iOS tab bar keeps each tab's state
  const memory = useRef<Partial<Record<Page, URLSearchParams>>>({});
  useEffect(() => {
    memory.current[route.page] = without(route.params, "game");
  }, [route]);

  const go = (r: Route, how: "push" | "replace", state: unknown = null) => {
    window.history[how === "push" ? "pushState" : "replaceState"](state, "", hashOf(r));
    setRoute(r);
  };

  const navigate = (p: Page, params?: URLSearchParams) => {
    if (p !== page || params) go({ page: p, params: params ?? memory.current[p] ?? new URLSearchParams() }, "push");
    window.scrollTo({ top: 0, behavior: "instant" }); // a tab switch jumps, it doesn't scroll
  };

  const base = BASE_FILTER[page];
  const filter = base && filterFromParams(route.params, base);
  const setFilter = (f: LibraryFilter) => go({ page, params: filterToParams(f, base!) }, "replace");

  const seeAll = (f: Partial<LibraryFilter>) => navigate("games", filterToParams({ ...DEFAULT_FILTER, ...f }, DEFAULT_FILTER));

  // Opening a game adds a history entry, so Back (or the iOS edge swipe) closes it
  const openGame = (g: Game) => {
    const params = new URLSearchParams(route.params);
    params.set("game", String(g.id));
    go({ page, params }, "push", { sheet: true });
  };
  const closeGame = () => {
    if ((window.history.state as { sheet?: boolean } | null)?.sheet) window.history.back();
    else go({ page, params: without(route.params, "game") }, "replace");
  };

  const handleSync = async () => {
    if (!isLoggedIn) return setShowLogin(true);
    setSyncing(true);
    try {
      const result = await api.syncSteam();
      const moves = [
        result.movedToPlaying && `${result.movedToPlaying} to Playing`,
        result.movedToBacklog && `${result.movedToBacklog} back to Backlog`,
      ].filter(Boolean);
      notify(`Synced: ${[`${result.added} added`, `${result.updated} updated`, ...moves].join(", ")}`);
      lib.load();
    } catch (e) {
      const running = e instanceof ApiError && e.status === 409;
      notify(running ? "A sync is already running" : "Steam sync failed", false);
    } finally {
      setSyncing(false);
    }
  };

  const exportLibrary = (kind: "csv" | "json") => {
    const day = new Date().toISOString().slice(0, 10);
    // The byte-order mark tells Excel the file is UTF-8 (otherwise "Pokémon" shows as "PokÃ©mon")
    if (kind === "csv") download(`gamelog-${day}.csv`, "﻿" + toCsv(lib.games), "text/csv;charset=utf-8");
    else download(`gamelog-${day}.json`, JSON.stringify(lib.games, null, 2), "application/json");
  };

  // Keyboard shortcuts (desktop): / search, n add, g then h/g/b/s to switch pages, ? help
  const keys = useRef<(e: KeyboardEvent) => void>(() => {});
  const gAt = useRef(0); // when "g" was pressed; the second key must follow within a second
  useEffect(() => {
    keys.current = (e) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select, [contenteditable]")) return;
      if (document.querySelector(".modal-overlay")) return;
      if (Date.now() - gAt.current < 1000) {
        gAt.current = 0;
        const p = ({ h: "dashboard", g: "games", b: "backlog", s: "stats" } as Record<string, Page>)[e.key];
        if (p) return navigate(p);
      }
      if (e.key === "g") gAt.current = Date.now();
      else if (e.key === "/") {
        e.preventDefault();
        if (!BASE_FILTER[page]) navigate("games");
        setTimeout(() => searchRef.current?.focus());
      } else if (e.key === "n" && isLoggedIn) setShowAdd(true);
      else if (e.key === "?") notify("Shortcuts: / search · n add a game · g then h, g, b or s to switch pages");
    };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keys.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Pull to refresh on touch screens
  const ptrRef = useRef<HTMLDivElement>(null);
  const refresh = useRef(lib.load);
  useEffect(() => {
    refresh.current = lib.load;
  });
  useEffect(() => {
    if (!window.matchMedia("(pointer: coarse)").matches) return;
    let startY: number | null = null;
    let dist = 0;
    // Set straight on the element (a CSS variable), not React state: no re-render per touchmove
    const setPull = (px: number) => ptrRef.current?.style.setProperty("--pull", String(px));
    const start = (e: TouchEvent) => {
      const atTop = window.scrollY <= 0 && !document.querySelector(".modal-overlay");
      startY = atTop ? e.touches[0].clientY : null;
      dist = 0;
    };
    const move = (e: TouchEvent) => {
      if (startY === null) return;
      dist = Math.max(0, e.touches[0].clientY - startY) / 2;
      setPull(Math.min(dist, 80));
    };
    const end = () => {
      if (startY !== null && dist >= 60) refresh.current();
      startY = null;
      setPull(0);
    };
    window.addEventListener("touchstart", start, { passive: true });
    window.addEventListener("touchmove", move, { passive: true });
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("touchstart", start);
      window.removeEventListener("touchmove", move);
      window.removeEventListener("touchend", end);
    };
  }, []);

  let content;
  if (lib.state === "loading") content = <LoadingState />;
  else if (lib.state === "error") content = <ErrorState onRetry={lib.retry} />;
  else if (lib.games.length === 0)
    content = <EmptyLibrary isLoggedIn={isLoggedIn} onAdd={() => setShowAdd(true)} onSync={handleSync} />;
  else if (page === "dashboard") content = <Dashboard games={lib.games} onOpen={openGame} onSeeAll={seeAll} syncedAt={lib.syncedAt} />;
  else if (page === "stats") content = <Stats games={lib.games} onOpen={openGame} onSeeAll={seeAll} />;
  else
    content = (
      <GamesPage
        key={page}
        games={lib.games}
        platforms={lib.platforms}
        filter={filter!}
        base={base!}
        onFilter={setFilter}
        isLoggedIn={isLoggedIn}
        lib={lib}
        searchRef={searchRef}
        onOpen={openGame}
        onAdd={() => setShowAdd(true)}
        onPick={page === "backlog" ? () => setShowPick(true) : undefined}
        onLoginRequest={() => setShowLogin(true)}
      />
    );

  const backlogPool = lib.games.filter((g) => !g.isHidden && g.userEntries.some((e) => e.status === "Backlog"));

  return (
    <div className="app">
      {/* Mobile nav bar (iOS-style; sidebar is desktop only) */}
      <header className={`mobile-topbar ${scrolled ? "scrolled" : ""}`}>
        <span className="mobile-topbar-title">{PAGE_TITLES[page]}</span>
      </header>

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>GameLog</h1>
          <span>by MittsMods</span>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${page === "dashboard" ? "active" : ""}`} onClick={() => navigate("dashboard")}>
            <span className="nav-icon">◈</span> Dashboard
          </button>
          <button className={`nav-item ${page === "games" ? "active" : ""}`} onClick={() => navigate("games")}>
            <span className="nav-icon">▦</span> All Games
          </button>
          <button className={`nav-item ${page === "backlog" ? "active" : ""}`} onClick={() => navigate("backlog")}>
            <span className="nav-icon">◎</span> Backlog
          </button>
          <button className={`nav-item ${page === "stats" ? "active" : ""}`} onClick={() => navigate("stats")}>
            <span className="nav-icon">▥</span> Stats
          </button>
        </nav>

        <div className="sidebar-bottom">
          {isLoggedIn && (
            <button className="sync-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? "SYNCING..." : "⟳ SYNC STEAM"}
            </button>
          )}
          <button className="nav-item sidebar-link" onClick={() => exportLibrary("csv")}>
            <span className="nav-icon">⤓</span> Export CSV
          </button>
          {isLoggedIn ? (
            <button
              className="nav-item sidebar-link"
              onClick={() => {
                logout();
                lib.load();
              }}
            >
              <span className="nav-icon">⏻</span> Log Out
            </button>
          ) : (
            <button className="nav-item sidebar-link sidebar-login" onClick={() => setShowLogin(true)}>
              <span className="nav-icon">→</span> Admin Login
            </button>
          )}
          <a href="/" className="nav-item sidebar-link">
            <span className="nav-icon">←</span> MittsMods
          </a>
          <span className="sidebar-hint">Press ? for shortcuts</span>
        </div>
      </aside>

      {/* Main content */}
      <main className="main">
        <div ref={ptrRef} className={`ptr ${lib.refreshing ? "refreshing" : ""}`} aria-hidden={!lib.refreshing}>
          <span>⟳</span>
        </div>
        <h1 className="large-title">{PAGE_TITLES[page]}</h1>
        {content}
      </main>

      {/* Mobile tab bar */}
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.page}
            className={`tab ${page === t.page ? "active" : ""}`}
            aria-current={page === t.page ? "page" : undefined}
            onClick={() => navigate(t.page)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={t.icon} />
            </svg>
            {t.label}
          </button>
        ))}
        <button className="tab" onClick={() => setShowAccount(true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0z" />
          </svg>
          Account
        </button>
      </nav>

      {open && (
        <GameSheet
          key={open.id}
          game={open}
          platforms={lib.platforms}
          isLoggedIn={isLoggedIn}
          lib={lib}
          notify={notify}
          onClose={closeGame}
          onLoginRequest={() => setShowLogin(true)}
        />
      )}

      {showAdd && isLoggedIn && (
        <AddGameSheet
          games={lib.games}
          platforms={lib.platforms}
          onAdd={lib.add}
          onOpen={openGame}
          onClose={() => setShowAdd(false)}
        />
      )}

      {showPick && <PickSheet pool={backlogPool} onOpen={openGame} onClose={() => setShowPick(false)} />}

      {showAccount && (
        <AccountSheet
          isLoggedIn={isLoggedIn}
          syncing={syncing}
          onClose={() => setShowAccount(false)}
          onSync={() => {
            setShowAccount(false);
            handleSync();
          }}
          onExport={(kind) => {
            setShowAccount(false);
            exportLibrary(kind);
          }}
          onLogin={() => {
            setShowAccount(false);
            setShowLogin(true);
          }}
          onLogout={() => {
            setShowAccount(false);
            logout();
            lib.load();
          }}
        />
      )}

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => {
            notify("Logged in as admin");
            lib.load(); // the admin also sees hidden games
          }}
          login={login}
        />
      )}

      {toast && (
        <div key={toast.id} className={`toast ${toast.type}`} role="status">
          <span>{toast.msg}</span>
          {toast.undo && (
            <button
              className="toast-undo"
              onClick={() => {
                toast.undo!();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// iOS-style action sheet for what the sidebar footer holds on desktop
function AccountSheet({
  isLoggedIn,
  syncing,
  onClose,
  onSync,
  onExport,
  onLogin,
  onLogout,
}: {
  isLoggedIn: boolean;
  syncing: boolean;
  onClose: () => void;
  onSync: () => void;
  onExport: (kind: "csv" | "json") => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  useSheet(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" role="dialog" aria-modal="true" aria-label="Account" onClick={(e) => e.stopPropagation()}>
        <div className="action-group">
          {isLoggedIn && (
            <button className="action" onClick={onSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync Steam Library"}
            </button>
          )}
          <button className="action" onClick={() => onExport("csv")}>
            Export as Spreadsheet (CSV)
          </button>
          <button className="action" onClick={() => onExport("json")}>
            Export as JSON
          </button>
          {isLoggedIn ? (
            <button className="action destructive" onClick={onLogout}>
              Log Out
            </button>
          ) : (
            <button className="action" onClick={onLogin}>
              Admin Login
            </button>
          )}
          <a className="action" href="/">
            Back to MittsMods
          </a>
        </div>
        <div className="action-group">
          <button className="action cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
