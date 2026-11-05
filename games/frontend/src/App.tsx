import { useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import GamesPage from "./pages/GamesPage";
import LoginModal from "./components/LoginModal";
import { useAuth } from "./hooks/useAuth";
import { api } from "./api/client";
import { useEscape } from "./hooks/useEscape";
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

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [syncing, setSyncing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showAccount, setShowAccount] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const { isLoggedIn, checking, login, logout } = useAuth();

  // iOS large title: nav bar shows the small title once the large one scrolls away
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 36);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSync = async () => {
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }
    setSyncing(true);
    try {
      const result = await api.syncSteam();
      showToast(
        `Synced — ${result.added} added, ${result.updated} updated`,
        "success",
      );
      // Remount the current page so it refetches the library
      setRefreshKey((k) => k + 1);
    } catch (e) {
      const running = e instanceof Error && e.message.startsWith("API error 409");
      showToast(running ? "A sync is already running" : "Steam sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const navigate = (p: Page) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  if (checking) {
    return <div className="loading">LOADING...</div>;
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
          <button
            className={`nav-item ${page === "dashboard" ? "active" : ""}`}
            onClick={() => navigate("dashboard")}
          >
            <span className="nav-icon">◈</span> Dashboard
          </button>
          <button
            className={`nav-item ${page === "games" ? "active" : ""}`}
            onClick={() => navigate("games")}
          >
            <span className="nav-icon">▦</span> All Games
          </button>
          <button
            className={`nav-item ${page === "backlog" ? "active" : ""}`}
            onClick={() => navigate("backlog")}
          >
            <span className="nav-icon">◎</span> Backlog
          </button>
        </nav>

        <div className="sidebar-bottom">
          {/* Sync — only shown when logged in */}
          {isLoggedIn && (
            <button
              className="sync-btn"
              onClick={handleSync}
              disabled={syncing}
              style={{ marginBottom: "10px" }}
            >
              {syncing ? "SYNCING..." : "⟳ SYNC STEAM"}
            </button>
          )}

          {/* Login / Logout */}
          {isLoggedIn ? (
            <button
              className="nav-item"
              style={{
                fontSize: "0.6875rem",
                display: "flex",
                padding: "8px 0",
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                marginBottom: "4px",
                color: "var(--text-faint)",
              }}
              onClick={logout}
            >
              <span className="nav-icon">⏻</span> Log Out
            </button>
          ) : (
            <button
              className="nav-item"
              style={{
                fontSize: "0.6875rem",
                display: "flex",
                padding: "8px 0",
                width: "100%",
                background: "none",
                border: "none",
                cursor: "pointer",
                marginBottom: "4px",
                color: "var(--blue)",
              }}
              onClick={() => setShowLogin(true)}
            >
              <span className="nav-icon">→</span> Admin Login
            </button>
          )}

          <a
            href="/"
            className="nav-item"
            style={{ fontSize: "0.6875rem", display: "flex", padding: "8px 0" }}
          >
            <span className="nav-icon">←</span> MittsMods
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="main" key={refreshKey}>
        <h1 className="large-title">{PAGE_TITLES[page]}</h1>
        {page === "dashboard" && (
          <Dashboard onNavigate={navigate} isLoggedIn={isLoggedIn} />
        )}
        {page === "games" && (
          <GamesPage
            filter="all"
            isLoggedIn={isLoggedIn}
            onLoginRequest={() => setShowLogin(true)}
          />
        )}
        {page === "backlog" && (
          <GamesPage
            filter="Backlog"
            isLoggedIn={isLoggedIn}
            onLoginRequest={() => setShowLogin(true)}
          />
        )}
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
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d={t.icon} /></svg>
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
          onSuccess={() => showToast("Logged in as admin", "success")}
          login={login}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
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
