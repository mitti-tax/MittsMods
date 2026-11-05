// Loading, error and empty states shared by every page

export function LoadingState() {
  return (
    <div className="state" role="status">
      <div className="skeleton-row" aria-hidden="true">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="skeleton" />
        ))}
      </div>
      <p className="muted">Loading the library…</p>
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="state">
      <h2 className="state-title">Couldn't reach the library</h2>
      <p className="muted">The game server didn't respond. It may be restarting, so try again in a moment.</p>
      <button className="btn btn-primary" onClick={onRetry}>
        Try again
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
    <div className="state">
      <h2 className="state-title">The shelf is empty</h2>
      {isLoggedIn ? (
        <>
          <p className="muted">Import your Steam library, or add a console game by hand.</p>
          <div className="state-actions">
            <button className="btn btn-primary" onClick={onSync}>
              Sync Steam
            </button>
            <button className="btn btn-ghost" onClick={onAdd}>
              Add game
            </button>
          </div>
        </>
      ) : (
        <p className="muted">No games have been logged yet. Check back soon.</p>
      )}
    </div>
  );
}
