import { useState } from "react";
import Dashboard from "./pages/Dashboard";
import GamesPage from "./pages/GamesPage";
import { api } from "./api/client";
import "./index.css";

type Page = "dashboard" | "games" | "backlog" | "favourites";

function App() {
  const [page, setPage] = useState<Page>("dashboard");
  const [syncing, setSyncing] = useState(false);
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>GameLog</h1>
          <span>by MittsMods</span>
        </div>

        <nav className="sidebar-nav">
          <div
            className={`nav-item ${page === "dashboard" ? "active" : ""}`}
            onClick={() => setPage("dashboard")}
          >
            <span className="nav-icon">◈</span> Dashboard
          </div>
          <div
            className={`nav-item ${page === "games" ? "active" : ""}`}
            onClick={() => setPage("games")}
          >
            <span className="nav-icon">▦</span> All Games
          </div>
          <div
            className={`nav-item ${page === "backlog" ? "active" : ""}`}
            onClick={() => setPage("backlog")}
          >
            <span className="nav-icon">◎</span> Backlog
          </div>
          <div
            className={`nav-item ${page === "favourites" ? "active" : ""}`}
            onClick={() => setPage("favourites")}
          >
            <span className="nav-icon">★</span> Favourites
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

      <main className="main">
        {page === "dashboard" && <Dashboard onNavigate={setPage} />}
        {page === "games" && <GamesPage filter="all" />}
        {page === "backlog" && <GamesPage filter="Backlog" />}
        {page === "favourites" && <GamesPage filter="favourites" />}
      </main>

      {toast && <div className={`toast ${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}

export default App;
