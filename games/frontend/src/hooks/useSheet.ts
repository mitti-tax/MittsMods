import { useEffect, useRef } from "react";

// Every open sheet registers here. Escape closes only the topmost one; while any is open the page
// behind is inert (no tabbing or clicking into it); when the last one closes, focus goes back to
// what opened it.
const stack: { current: () => void }[] = [];
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) stack[stack.length - 1].current();
});

// Sheets render as .modal-overlay children of .app; the toast stays usable for its Undo button
const setPageInert = (inert: boolean) =>
  document.querySelectorAll<HTMLElement>(".app > :not(.modal-overlay, .toast)").forEach((el) => (el.inert = inert));

export function useSheet(onClose: () => void) {
  const ref = useRef(onClose);
  useEffect(() => {
    ref.current = onClose;
  });
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    stack.push(ref);
    setPageInert(true);
    return () => {
      stack.splice(stack.indexOf(ref), 1);
      if (stack.length) return;
      setPageInert(false);
      // Only if focus was lost with the sheet: a sheet opening as this one closes (Log in to edit) keeps it
      if (document.activeElement === document.body) opener?.focus();
    };
  }, []);
}
