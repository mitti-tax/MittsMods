import { useEffect, useRef } from "react";

// Escape closes only the topmost open sheet, not every sheet in the stack
const stack: { current: () => void }[] = [];
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && stack.length) stack[stack.length - 1].current();
});

export function useEscape(onEscape: () => void) {
  const ref = useRef(onEscape);
  useEffect(() => {
    ref.current = onEscape;
  });
  useEffect(() => {
    stack.push(ref);
    return () => {
      stack.splice(stack.indexOf(ref), 1);
    };
  }, []);
}
