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
import { PlatformsContext } from "./lib/platforms";
import ConsolesPage from "./pages/ConsolesPage";
import Dashboard from "./pages/Dashboard";
import LibraryPage from "./pages/LibraryPage";
import "./index.css";

type Page = "home" | "library" | "consoles";

const PAGES: { page: Page; label: string; title: string; icon: string }[] = [
  { page: "home", label: "Home", title: "GameLog", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { page: "library", label: "Library", title: "Library", icon: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" },
  {
    page: "consoles",
    label: "Consoles",
    title: "Consoles",
    icon: "M7 7h10a5 5 0 0 1 0 10c-1.6 0-2.4-1-3-2h-4c-.6 1-1.4 2-3 2A5 5 0 0 1 7 7zm0 3v1.5H5.5v1.5H7v1.5h1.5V13H10v-1.5H8.5V10zm8.5 1a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm2-1.5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z",
  },
];

// The page lives in the URL hash so refresh and the back button work
const pageFromHash = (): Page => {
  const h = window.location.hash.replace("#/", "");
  return PAGES.some((p) => p.page === h) ? (h as Page) : "home";
};

function App() {
  const [page, setPage] = useState<Page>(pageFromHash);
  const [filter, setFilter] = useState<LibraryFilter>(DEFAULT_FILTER);
  const [openId, setOpenId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [showAccount, setShowAccount] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean; id: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((msg: string, ok = true) => {
    clearTimeout(toastTimer.current);
    setToast({ msg, ok, id: Date.now() });
    toastTimer.current = setTimeout(() => setToast(null), ok ? 3000 : 6000);
  }, []);

  const { isLoggedIn, login, logout } = useAuth();
  const lib = useLibrary(notify);
  const open = lib.games.find((g) => g.id === openId); // always the latest copy

  // iOS large title: the nav bar shows the small title once the large one scrolls away
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
    setFilter({ ...DEFAULT_FILTER, ...f });
    navigate("library");
  };

  const sync = async () => {
    if (!isLoggedIn) return setShowLogin(true);
    setSyncing(true);
    try {
      const r = await api.syncSteam();
      notify(`Steam synced: ${r.added} added, ${r.updated} updated`);
      lib.load();
    } catch (e) {
      const running = e instanceof Error && e.message.startsWith("API error 409");
      notify(running ? "A Steam sync is already running. Give it a minute." : "Steam sync failed. Try again.", false);
    } finally {
      setSyncing(false);
    }
  };

  const quickStatus = (g: Game, status: PlayStatus) => {
    const e = entryOf(g);
    if (e) lib.update(g, e, { status }, true);
  };

  const current = PAGES.find((p) => p.page === page)!;

  let content;
  if (lib.state === "loading") content = <LoadingState />;
  else if (lib.state === "error") content = <ErrorState onRetry={lib.retry} />;
  else if (lib.games.length === 0)
    content = <EmptyLibrary isLoggedIn={isLoggedIn} onAdd={() => setShowAdd(true)} onSync={sync} />;
  else if (page === "home") content = <Dashboard games={lib.games} onOpen={(g) => setOpenId(g.id)} onSeeAll={seeAll} />;
  else if (page === "library")
    content = (
      <LibraryPage
        games={lib.games}
        filter={filter}
        onFilter={setFilter}
        isLoggedIn={isLoggedIn}
        onOpen={(g) => setOpenId(g.id)}
        onAdd={() => setShowAdd(true)}
        onQuickStatus={quickStatus}
      />
    );
  else content = <ConsolesPage games={lib.games} onOpen={(g) => setOpenId(g.id)} onSeeAll={seeAll} />;

  return (
    <PlatformsContext.Provider value={lib.platforms}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      {/* Desktop header */}
      <header className="masthead">
        <a className="wordmark" href="#/home" onClick={() => window.scrollTo(0, 0)}>
          GameLog
        </a>
        <nav className="masthead-nav" aria-label="Sections">
          {PAGES.map((p) => (
            <a
              key={p.page}
              href={`#/${p.page}`}
              className="masthead-link"
              aria-current={page === p.page ? "page" : undefined}
              onClick={() => window.scrollTo(0, 0)}
            >
              {p.label}
            </a>
          ))}
        </nav>
        <div className="masthead-actions">
          {isLoggedIn ? (
            <>
              <button className="btn btn-ghost" onClick={sync} disabled={syncing}>
                {syncing ? "Syncing…" : "Sync Steam"}
              </button>
              <button className="link-btn" onClick={logout}>
                Log out
              </button>
            </>
          ) : (
            <button className="link-btn" onClick={() => setShowLogin(true)}>
              Admin login
            </button>
          )}
          <a className="link-btn" href="/">
            MittsMods
          </a>
        </div>
      </header>

      {/* Phone nav bar */}
      <header className={`mobile-topbar ${scrolled ? "scrolled" : ""}`}>
        <span className="mobile-topbar-title">{current.title}</span>
      </header>

      <main className="main" id="main">
        <h1 className="large-title">{current.title}</h1>
        {content}
      </main>

      {/* Phone tab bar */}
      <nav className="tabbar" aria-label="Sections">
        {PAGES.map((p) => (
          <button
            key={p.page}
            className="tab"
            aria-current={page === p.page ? "page" : undefined}
            onClick={() => navigate(p.page)}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d={p.icon} fillRule="evenodd" />
            </svg>
            {p.label}
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
          isLoggedIn={isLoggedIn}
          onClose={() => setOpenId(null)}
          onSave={lib.update}
          onDelete={lib.remove}
          onToggleFavourite={lib.toggleFavourite}
        />
      )}

      {showAdd && isLoggedIn && <AddGameSheet onAdd={lib.add} onClose={() => setShowAdd(false)} />}

      {showAccount && (
        <AccountSheet
          isLoggedIn={isLoggedIn}
          syncing={syncing}
          onClose={() => setShowAccount(false)}
          onSync={() => {
            setShowAccount(false);
            sync();
          }}
          onLogin={() => {
            setShowAccount(false);
            setShowLogin(true);
          }}
          onLogout={() => {
            setShowAccount(false);
            logout();
            notify("Logged out");
          }}
        />
      )}

      {showLogin && (
        <LoginModal onClose={() => setShowLogin(false)} onSuccess={() => notify("Logged in. Editing is on.")} login={login} />
      )}

      {toast && (
        <div key={toast.id} className={`toast ${toast.ok ? "" : "toast-error"}`} role="status">
          {toast.msg}
        </div>
      )}
    </PlatformsContext.Provider>
  );
}

// iOS-style action sheet holding what the desktop header shows
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
              {syncing ? "Syncing…" : "Sync Steam library"}
            </button>
          )}
          {isLoggedIn ? (
            <button className="action destructive" onClick={onLogout}>
              Log out
            </button>
          ) : (
            <button className="action" onClick={onLogin}>
              Admin login
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
