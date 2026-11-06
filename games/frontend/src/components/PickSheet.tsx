import { useState } from "react";
import type { Game } from "../api/client";
import { useSheet } from "../hooks/useSheet";
import Cover from "./Cover";

const pickFrom = (pool: Game[], not?: Game) => {
  const options = pool.length > 1 && not ? pool.filter((g) => g.id !== not.id) : pool;
  return options[Math.floor(Math.random() * options.length)];
};

// "What should I play?": a random game from the backlog, re-rollable
export default function PickSheet({ pool, onOpen, onClose }: { pool: Game[]; onOpen: (g: Game) => void; onClose: () => void }) {
  useSheet(onClose);
  const [pick, setPick] = useState(() => pickFrom(pool));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-narrow" role="dialog" aria-modal="true" aria-label="What should I play?" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">What should I play?</span>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="modal-body">
          {pick ? (
            <div className="pick" aria-live="polite">
              <Cover key={pick.id} src={pick.coverUrl} className="pick-cover" lazy={false} />
              <div className="pick-title">{pick.title}</div>
              <div className="pick-meta">
                {[pick.genre, pick.releaseYear, pick.timeToBeatHours && `~${pick.timeToBeatHours}h to beat`]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
              <div className="btn-row">
                <button className="btn btn-ghost" onClick={() => setPick(pickFrom(pool, pick))} disabled={pool.length < 2}>
                  🎲 Another
                </button>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    onClose();
                    onOpen(pick);
                  }}
                >
                  Open
                </button>
              </div>
            </div>
          ) : (
            <p className="empty-state-sub">Your backlog is empty. Nothing to pick from.</p>
          )}
        </div>
      </div>
    </div>
  );
}
