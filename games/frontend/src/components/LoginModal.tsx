import { useState } from "react";
import Modal from "./Modal";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  login: (password: string) => Promise<{ success: boolean; message?: string }>;
}

export default function LoginModal({ onClose, onSuccess, login }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim() || loading) return;

    setLoading(true);
    setError("");

    const result = await login(password);
    setLoading(false);

    if (result.success) {
      onSuccess();
      onClose();
      return;
    }

    setError(result.message ?? "Incorrect password.");
    setPassword("");
  };

  return (
    <Modal title="Admin Login" onClose={onClose} maxWidth="380px">
      {/* A real form, so password managers offer to fill and save it. */}
      <form onSubmit={handleSubmit}>
        <p className="dialog-message">
          Enter the admin password to edit the game library.
        </p>

        <div className="form-group">
          <label className="form-label" htmlFor="admin-password">
            Password
          </label>
          <input
            id="admin-password"
            className="form-input"
            type="password"
            name="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "admin-password-error" : undefined}
            autoFocus
          />
        </div>

        {error && (
          <p className="form-error" id="admin-password-error" role="alert">
            {error}
          </p>
        )}

        <div className="btn-row">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !password.trim()}
          >
            {loading ? "Checking…" : "Log In"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
