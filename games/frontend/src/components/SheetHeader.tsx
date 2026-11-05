// Modal header. Desktop: title + ✕ (the form's buttons sit at the bottom).
// Phones (CSS): Cancel top-left, confirm top-right, and the bottom .btn-row is hidden.
export default function SheetHeader({
  title,
  onCancel,
  confirmLabel,
  onConfirm,
  confirmDisabled,
}: {
  title: string;
  onCancel: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  confirmDisabled?: boolean;
}) {
  return (
    <div className="modal-header">
      <button type="button" className="sheet-action" onClick={onCancel}>
        Cancel
      </button>
      <span className="modal-title">{title}</span>
      <button
        type="button"
        className="sheet-action confirm"
        onClick={onConfirm}
        disabled={confirmDisabled}
      >
        {confirmLabel}
      </button>
      <button type="button" className="modal-close" onClick={onCancel} aria-label="Close">
        ✕
      </button>
    </div>
  );
}
