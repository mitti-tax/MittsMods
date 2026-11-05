import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Game, type PlayStatus } from "./api/client";
import AddGameSheet from "./components/AddGameSheet";
import GameSheet from "./components/GameSheet";
import LoginModal from "./components/LoginModal";
import { EmptyLibrary, ErrorState, LoadingState } from "./components/States";
import { useAuth } from "./hooks/useAuth";
import { useEscape } from "./hooks/useEscape";
import { useLibrary } from "./hooks/useLibrary";
import { DEFAULT_FILTER, entryOf, type LibraryFilter } from "./lib/games";
import Dashboard from "./pages/Dashboard";
import GamesPage from "./pages/GamesPage";
import "./index.css";

type Page = "dashboard" | "games" | "backlog";

const PAGE_TITLES: Record<Page, string> = {
  dashboard: "GameLog",
  games: "All Games",
  backlog: "Backlog",
};

const TABS: { page: Page; label: string; icon: string }[] = [
  { page: "dashboard", label: "Home", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { page: "games", label: "Games", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  { page: "backlog", label: "Backlog", icon: "M6 3h12v18l-6-4-6 4z" },
];

// The page lives in the URL hash so refresh and the back button work
const pageFromHash = (): Page => {
  const h = window.location.hash.replace("#/", "");
  return h in PAGE_TITLES ? (h as Page) : "dashboard";
};

const BACKLOG_FILTER: LibraryFilter = { ...DEFAULT_FILTER, status: "Backlog" };

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [gamesFilter, setGamesFilter] = useState<LibraryFilter>(DEFAULT_FILTER);
  const [backlogFilter, setBacklogFilter] = useState<LibraryFilter>(BACKLOG_FILTER);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error"; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // One toast at a time; a new one restarts the timer instead of being cut short
  const notify = useCallback((msg: string, ok = true) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type: ok ? "success" : "error", id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ok ? 3000 : 5000);
  }, []);

  const { isLoggedIn, login, logout } = useAuth();
  const lib = useLibrary(notify);
  const open = lib.games.find((g) => g.id === openId); // always the latest copy

  // iOS large title: nav bar shows the small title once the large one scrolls away
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = (p: Page) => {
    if (p !== page) window.location.hash = `/${p}`;
    window.scrollTo(0, 0);
  };

  const seeAll = (f: Partial<LibraryFilter>) => {
    setGamesFilter({ ...DEFAULT_FILTER, ...f });
    navigate("games");
  };

  const handleSync = async () => {
    if (!isLoggedIn) return setShowLogin(true);
    setSyncing(true);
    try {
      const result = await api.syncSteam();
      notify(`Synced — ${result.added} added, ${result.updated} updated`);
      lib.load();
    } catch (e) {
      const running = e instanceof Error && e.message.startsWith("API error 409");
      notify(running ? "A sync is already running" : "Steam sync failed", false);
    } finally {
      setSyncing(false);
    }
  };

  const quickStatus = (g: Game, status: PlayStatus) => {
    const e = entryOf(g);
    if (e) lib.update(g, e, { status }, true);
  };

  const openGame = (g: Game) => setOpenId(g.id);

  let content;
  if (lib.state === "loading") content = <LoadingState />;
  else if (lib.state === "error") content = <ErrorState onRetry={lib.retry} />;
  else if (lib.games.length === 0)
    content = <EmptyLibrary isLoggedIn={isLoggedIn} onAdd={() => setShowAdd(true)} onSync={handleSync} />;
  else if (page === "dashboard") content = <Dashboard games={lib.games} onOpen={openGame} onSeeAll={seeAll} />;
  else {
    const backlog = page === "backlog";
    content = (
      <GamesPage
        key={page}
        games={lib.games}
        platforms={lib.platforms}
        filter={backlog ? backlogFilter : gamesFilter}
        onFilter={backlog ? setBacklogFilter : setGamesFilter}
        isLoggedIn={isLoggedIn}
        onOpen={openGame}
        onAdd={() => setShowAdd(true)}
        onLoginRequest={() => setShowLogin(true)}
        onQuickStatus={quickStatus}
      />
    );
  }

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
        </nav>

        <div className="sidebar-bottom">
          {isLoggedIn && (
            <button className="sync-btn" onClick={handleSync} disabled={syncing}>
              {syncing ? "SYNCING..." : "⟳ SYNC STEAM"}
            </button>
          )}
          {isLoggedIn ? (
            <button className="nav-item sidebar-link" onClick={logout}>
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
        </div>
      </aside>

      {/* Main content */}
      <main className="main">
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
          onClose={() => setOpenId(null)}
          onSave={lib.update}
          onDelete={lib.remove}
          onToggleFavourite={lib.toggleFavourite}
          onLoginRequest={() => setShowLogin(true)}
        />
      )}

      {showAdd && isLoggedIn && (
        <AddGameSheet platforms={lib.platforms} onAdd={lib.add} onClose={() => setShowAdd(false)} />
      )}

      {showAccount && (
        <AccountSheet
          isLoggedIn={isLoggedIn}
          syncing={syncing}
          onClose={() => setShowAccount(false)}
          onSync={() => {
            setShowAccount(false);
            handleSync();
          }}
          onLogin={() => {
            setShowAccount(false);
            setShowLogin(true);
          }}
          onLogout={() => {
            setShowAccount(false);
            logout();
          }}
        />
      )}

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => notify("Logged in as admin")}
          login={login}
        />
      )}

      {toast && (
        <div key={toast.id} className={`toast ${toast.type}`} role="status">
          {toast.msg}
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
  onLogin,
  onLogout,
}: {
  isLoggedIn: boolean;
  syncing: boolean;
  onClose: () => void;
  onSync: () => void;
  onLogin: () => void;
  onLogout: () => void;
}) {
  useEscape(onClose);
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="action-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="action-group">
          {isLoggedIn && (
            <button className="action" onClick={onSync} disabled={syncing}>
              {syncing ? "Syncing…" : "Sync Steam Library"}
            </button>
          )}
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
