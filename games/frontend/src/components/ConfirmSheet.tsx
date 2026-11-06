import { useSheet } from "../hooks/useSheet";

// Destructive confirmation: action sheet on phones, small dialog on desktop
export default function ConfirmSheet({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useSheet(onCancel);
  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        e.stopPropagation(); // don't also close a sheet underneath
        onCancel();
      }}
    >
      <div
        className="action-sheet"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="action-group">
          <div className="action-prompt">
            <strong id="confirm-title">{title}</strong>
            <span>{message}</span>
          </div>
          <button className="action destructive" onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
        <div className="action-group">
          <button className="action cancel" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
