import { useState } from "react";
import { useEscape } from "../hooks/useEscape";
import SheetHeader from "./SheetHeader";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  login: (password: string) => Promise<{ success: boolean; message?: string }>;
}

export default function LoginModal({ onClose, onSuccess, login }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEscape(onClose);

  const submit = async () => {
    if (!password.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const result = await login(password);
      if (result.success) {
        onSuccess();
        onClose();
        return;
      }
      setError(result.message ?? "That password isn't right.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <form
        className="modal modal-narrow"
        role="dialog"
        aria-label="Admin login"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <SheetHeader
          title="Admin login"
          onCancel={onClose}
          confirmLabel={loading ? "Checking…" : "Log in"}
          onConfirm={submit}
          confirmDisabled={loading || !password.trim()}
        />
        <div className="modal-body">
          <p className="muted">Log in to add games, edit your log and sync Steam.</p>
          <div className="field">
            <label className="field-label" htmlFor="f-password">
              Password
            </label>
            <input
              id="f-password"
              className="input"
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !password.trim()}>
              {loading ? "Checking…" : "Log in"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
