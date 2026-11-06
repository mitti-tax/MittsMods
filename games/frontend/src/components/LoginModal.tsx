import { useState } from "react";
import { useSheet } from "../hooks/useSheet";
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
  useSheet(onClose);

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
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
      setError(result.message ?? "Incorrect password.");
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-narrow" role="dialog" aria-modal="true" aria-label="Admin Login" onClick={(e) => e.stopPropagation()}>
        <SheetHeader
          title="Admin Login"
          onCancel={onClose}
          confirmLabel={loading ? "Checking…" : "Log In"}
          onConfirm={handleSubmit}
          confirmDisabled={loading || !password.trim()}
        />
        {/* A real form, so iOS Passwords and password managers offer to fill and save it */}
        <form className="modal-body" onSubmit={handleSubmit}>
          <p className="modal-intro">Enter the admin password to edit your game library.</p>
          {/* Password managers want a username field; this one is fixed and hidden */}
          <input type="text" name="username" autoComplete="username" value="admin" readOnly hidden />
          <div className="form-group">
            <label className="form-label" htmlFor="f-password">
              Password
            </label>
            <input
              id="f-password"
              name="password"
              className="form-input"
              type="password"
              autoComplete="current-password"
              enterKeyHint="go"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="btn-row">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading || !password.trim()}>
              {loading ? "Checking..." : "Log In"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
