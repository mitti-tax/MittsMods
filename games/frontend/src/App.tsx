import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import GamesPage from "./pages/GamesPage";
import { api } from "./api/client";
import "./index.css";

type Page = "dashboard" | "games" | "backlog";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [syncing, setSyncing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState<{
    msg: string;
    type: "success" | "error";
  } | null>(null);

  const showToast = (msg: string, type: "success" | "error") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const handleSync = async () => {
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
    setSidebarOpen(false); // close sidebar on mobile after nav
  };

  return (
    <div className="app">
      {/* Mobile top bar — only visible on small screens */}
      <div className="mobile-topbar">
        <span className="mobile-topbar-logo">GameLog</span>
        <button className="hamburger" onClick={() => setSidebarOpen((o) => !o)}>
          {sidebarOpen ? "✕" : "☰"}
        </button>
      </div>

      {/* Sidebar overlay — closes sidebar when tapping outside */}
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
          <button
            className="sync-btn"
            onClick={handleSync}
            disabled={syncing}
            style={{ marginBottom: "10px" }}
          >
            {syncing ? "SYNCING..." : "⟳ SYNC STEAM"}
          </button>
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
        {page === "dashboard" && <Dashboard onNavigate={navigate} />}
        {page === "games" && <GamesPage filter="all" />}
        {page === "backlog" && <GamesPage filter="Backlog" />}
      </main>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

export default App;
