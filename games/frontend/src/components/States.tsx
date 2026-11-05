// Loading, error and empty states shared by every page

export function LoadingState() {
  return (
    <div className="loading" role="status">
      LOADING LIBRARY...
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
