import { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

// Only the topmost dialog reacts to Escape, and the page behind stays locked
// until the last one closes.
const openDialogs: symbol[] = [];
let scrollLocks = 0;

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Overrides the default max width, e.g. "380px" for small prompts. */
  maxWidth?: string;
  /** Extra class on the dialog element. */
  className?: string;
}

/**
 * An accessible dialog: labelled for screen readers, closable with Escape,
 * focus trapped while open and returned to whatever opened it, with the page
 * behind it locked from scrolling.
 */
export default function Modal({
  title,
  onClose,
  children,
  maxWidth,
  className,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const pressedOnOverlay = useRef(false);
  const titleId = useId();

  // Held in a ref so the setup effect can stay mount-only. Callers pass an
  // inline arrow, and keying the effect on it would re-run the whole
  // setup/teardown on every parent render — including the focus restore,
  // which would yank focus out of the dialog mid-edit.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const id = Symbol("dialog");
    openDialogs.push(id);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;

    // Respect a child's autoFocus; otherwise put focus on the dialog so the
    // title is announced before anything else.
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();

    if (scrollLocks === 0) document.body.style.overflow = "hidden";
    scrollLocks += 1;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (openDialogs[openDialogs.length - 1] !== id) return;
      event.stopPropagation();
      onCloseRef.current();
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);

      const index = openDialogs.indexOf(id);
      if (index !== -1) openDialogs.splice(index, 1);

      scrollLocks = Math.max(scrollLocks - 1, 0);
      if (scrollLocks === 0) document.body.style.overflow = "";

      previouslyFocused?.focus?.();
    };
  }, []);

  const handleTrapFocus = useCallback((event: React.KeyboardEvent) => {
    if (event.key !== "Tab") return;

    const dialog = dialogRef.current;
    if (!dialog) return;

    const focusable = Array.from(
      dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((element) => element.offsetParent !== null);

    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && (active === first || active === dialog)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }, []);

  return (
    <div
      className="modal-overlay"
      // Closing on mouse-up alone also fires when a drag that started inside
      // the dialog (selecting text) ends on the backdrop.
      onMouseDown={(event) => {
        pressedOnOverlay.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && pressedOnOverlay.current) {
          onClose();
        }
        pressedOnOverlay.current = false;
      }}
    >
      <div
        className={`modal${className ? ` ${className}` : ""}`}
        style={maxWidth ? { maxWidth } : undefined}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={dialogRef}
        onKeyDown={handleTrapFocus}
      >
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>
            {title}
          </h2>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
