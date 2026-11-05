// src/components/LoginModal.tsx

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

  const handleSubmit = async () => {
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
        <SheetHeader
          title="Admin Login"
          onCancel={onClose}
          confirmLabel={loading ? "Checking…" : "Log In"}
          onConfirm={handleSubmit}
          confirmDisabled={loading || !password.trim()}
        />
        <div className="modal-body">
          <p
            style={{
              fontSize: "0.8125rem",
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
              autoComplete="current-password"
              enterKeyHint="go"
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
                fontSize: "0.75rem",
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
