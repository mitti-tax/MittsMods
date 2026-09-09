import { useCallback, useEffect, useState } from "react";
import Dashboard from "./pages/Dashboard";
import GamesPage from "./pages/GamesPage";
import LoginModal from "./components/LoginModal";
import ToastProvider from "./components/ToastProvider";
import { useToast } from "./hooks/toast";
import { useAuth } from "./hooks/useAuth";
import { useHashRoute, type RouteParams } from "./hooks/useHashRoute";
import { ApiError, api } from "./api/client";
import "./index.css";

export default function App() {
  return (
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  );
}

function AppShell() {
  const { route, navigate, replace } = useHashRoute();
  const { isLoggedIn, checking, login, logout } = useAuth();
  const { showToast } = useToast();

  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  // Bumped after a Steam sync to force the pages to refetch.
  const [dataVersion, setDataVersion] = useState(0);

  // Unknown hashes (including an empty one on first load) land on the dashboard.
  useEffect(() => {
    if (route.path !== "/" && route.path !== "/library") replace("/");
  }, [route.path, replace]);

  const go = useCallback(
    (path: string, params?: RouteParams) => {
      navigate(path, params);
      setSidebarOpen(false);
    },
    [navigate],
  );

  useEffect(() => {
    if (!sidebarOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [sidebarOpen]);

  const handleSync = async () => {
    if (!isLoggedIn) {
      setShowLogin(true);
      return;
    }

    setSyncing(true);
    try {
      const result = await api.syncSteam();
      const parts = [`${result.added} added`, `${result.updated} updated`];
      if (result.remaining > 0) parts.push(`${result.remaining} left — sync again`);

      showToast(`Steam sync: ${parts.join(", ")}`, "success");
      setDataVersion((version) => version + 1);
    } catch (cause) {
      showToast(
        cause instanceof ApiError ? cause.message : "Steam sync failed.",
        "error",
      );
    } finally {
      setSyncing(false);
    }
  };

  if (checking) {
    return <div className="loading">LOADING…</div>;
  }

  const params = new URLSearchParams(route.search);
  const isLibrary = route.path === "/library";
  const libraryFilter = params.get("status") ?? (params.get("favourite") ? "fav" : "");

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>

      <header className="mobile-topbar">
        <span className="mobile-topbar-logo">GameLog</span>
        <button
          type="button"
          className="hamburger"
          aria-label={sidebarOpen ? "Close menu" : "Open menu"}
          aria-expanded={sidebarOpen}
          aria-controls="sidebar"
          onClick={() => setSidebarOpen((open) => !open)}
        >
          {sidebarOpen ? "✕" : "☰"}
        </button>
      </header>

      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`} id="sidebar">
        <div className="sidebar-logo">
          <h1>GameLog</h1>
          <span>by MittsMods</span>
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          <NavItem
            icon="◈"
            label="Dashboard"
            active={route.path === "/"}
            onClick={() => go("/")}
          />
          <NavItem
            icon="▦"
            label="All Games"
            active={isLibrary && libraryFilter === ""}
            onClick={() => go("/library")}
          />
          <NavItem
            icon="◎"
            label="Backlog"
            active={isLibrary && libraryFilter === "Backlog"}
            onClick={() => go("/library", { status: "Backlog" })}
          />
          <NavItem
            icon="★"
            label="Favourites"
            active={isLibrary && libraryFilter === "fav"}
            onClick={() => go("/library", { favourite: "1" })}
          />
        </nav>

        <div className="sidebar-bottom">
          {isLoggedIn && (
            <button
              type="button"
              className="sync-btn"
              onClick={handleSync}
              disabled={syncing}
            >
              {syncing ? "SYNCING…" : "⟳ SYNC STEAM"}
            </button>
          )}

          {isLoggedIn ? (
            <button type="button" className="nav-item nav-item-button" onClick={logout}>
              <span className="nav-icon" aria-hidden="true">
                ⏻
              </span>{" "}
              Log Out
            </button>
          ) : (
            <button
              type="button"
              className="nav-item nav-item-button is-accent"
              onClick={() => setShowLogin(true)}
            >
              <span className="nav-icon" aria-hidden="true">
                →
              </span>{" "}
              Admin Login
            </button>
          )}

          <a href="https://mitti-tax.github.io/MittsMods/" className="nav-item">
            <span className="nav-icon" aria-hidden="true">
              ←
            </span>{" "}
            MittsMods
          </a>
        </div>
      </aside>

      <main className="main" id="main-content">
        {isLibrary ? (
          <GamesPage
            key={`library-${dataVersion}`}
            search={route.search}
            isLoggedIn={isLoggedIn}
            onLoginRequest={() => setShowLogin(true)}
            onNavigate={navigate}
          />
        ) : (
          <Dashboard key={`dashboard-${dataVersion}`} onNavigate={navigate} />
        )}
      </main>

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onSuccess={() => showToast("Logged in as admin", "success")}
          login={login}
        />
      )}
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: string;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-item nav-item-button ${active ? "active" : ""}`}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
    >
      <span className="nav-icon" aria-hidden="true">
        {icon}
      </span>{" "}
      {label}
    </button>
  );
}
