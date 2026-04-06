// src/components/LoginModal.tsx

import { useState } from "react";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  login: (password: string) => Promise<{ success: boolean; message?: string }>;
}

export default function LoginModal({ onClose, onSuccess, login }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!password.trim()) return;
    setLoading(true);
    setError("");
    const result = await login(password);
    setLoading(false);
    if (result.success) {
      onSuccess();
      onClose();
    } else {
      setError(result.message ?? "Incorrect password.");
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: "380px" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <span className="modal-title">Admin Login</span>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted)",
              marginBottom: "20px",
            }}
          >
            Enter the admin password to edit your game library.
          </p>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              className="form-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoFocus
            />
          </div>

          {error && (
            <div
              style={{
                fontSize: "12px",
                color: "var(--red)",
                fontFamily: "var(--font-mono)",
                marginBottom: "12px",
                padding: "8px 10px",
                background: "rgba(224,85,85,0.08)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid rgba(224,85,85,0.2)",
              }}
            >
              {error}
            </div>
          )}

          <div className="btn-row">
            <button className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={loading || !password.trim()}
            >
              {loading ? "Checking..." : "Log In"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
