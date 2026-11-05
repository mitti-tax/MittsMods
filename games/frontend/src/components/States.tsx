// Loading, error and empty states shared by every page

// Placeholder cards in the shape of the library, so the page doesn't jump when it arrives
export function LoadingState() {
  return (
    <div className="section" role="status" aria-label="Loading library">
      <div className="games-grid">
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="game-card skeleton">
            <div className="game-card-cover-placeholder" />
            <div className="game-card-body">
              <div className="skeleton-line" />
              <div className="skeleton-line short" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="empty-state">
      <p>COULDN'T REACH THE LIBRARY</p>
      <p className="empty-state-sub">The API didn't respond. It may be restarting, so try again in a moment.</p>
      <button className="btn btn-primary" onClick={onRetry}>
        Try Again
      </button>
    </div>
  );
}

export function EmptyLibrary({
  isLoggedIn,
  onAdd,
  onSync,
}: {
  isLoggedIn: boolean;
  onAdd: () => void;
  onSync: () => void;
}) {
  return (
    <div className="empty-state">
      <p>NO GAMES LOGGED YET</p>
      {isLoggedIn ? (
        <div className="empty-state-actions">
          <button className="btn btn-primary" onClick={onSync}>
            ⟳ Sync Steam
          </button>
          <button className="btn btn-ghost" onClick={onAdd}>
            + Add Game
          </button>
        </div>
      ) : (
        <p className="empty-state-sub">Nothing has been logged yet. Check back soon.</p>
      )}
    </div>
  );
}
