import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import GamesPage from "./pages/GamesPage";
import LoginModal from "./components/LoginModal";
import { useAuth } from "./hooks/useAuth";
import { api } from "./api/client";
import "./index.css";

type Page = "dashboard" | "games" | "backlog";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const { isLoggedIn, checking, login, logout } = useAuth();

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
      setPage((p) => {
        setTimeout(() => setPage(p), 0);
        return "dashboard";
      });
    } catch {
      showToast("Steam sync failed", "error");
    } finally {
      setSyncing(false);
    }
  };

  const navigate = (p: Page) => {
    setPage(p);
    setSidebarOpen(false);
  };

  if (checking) {
    return <div className="loading">LOADING...</div>;
  }

  return (
    <div className="app">
      {/* Mobile top bar */}
      <div className="mobile-topbar">
        <span className="mobile-topbar-logo">GameLog</span>
        <button className="hamburger" onClick={() => setSidebarOpen((o) => !o)}>
          {sidebarOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Sidebar overlay */}
      <div
        className={`sidebar-overlay ${sidebarOpen ? "visible" : ""}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <h1>GameLog</h1>
          <span>by MittsMods</span>
        </div>

        <nav className="sidebar-nav">
          <div
            className={`nav-item ${page === "dashboard" ? "active" : ""}`}
            onClick={() => navigate("dashboard")}
          >
            <span className="nav-icon">◈</span> Dashboard
          </div>
          <div
            className={`nav-item ${page === "games" ? "active" : ""}`}
            onClick={() => navigate("games")}
          >
            <span className="nav-icon">▦</span> All Games
          </div>
          <div
            className={`nav-item ${page === "backlog" ? "active" : ""}`}
            onClick={() => navigate("backlog")}
          >
            <span className="nav-icon">◎</span> Backlog
          </div>
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
                fontSize: "11px",
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
                fontSize: "11px",
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
            href="https://mitti-tax.github.io/MittsMods/"
            className="nav-item"
            style={{ fontSize: "11px", display: "flex", padding: "8px 0" }}
          >
            <span className="nav-icon">←</span> MittsMods
          </a>
        </div>
      </aside>

      {/* Main content */}
      <main className="main">
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

export default App;
