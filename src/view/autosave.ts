import { useCallback, useEffect, useRef } from "react";
import type { Sketch } from "../engine";

// How long, in milliseconds, the Sketch must stay unchanged before it is saved.
const autosaveDelay = 300;

// Saves the Sketch shortly after each change, and straight away when the Editor closes or the page is left, so a
// change made just before is never lost.
export function useAutosave(current: Sketch, save: (sketch: Sketch) => void) {
  const saved = useRef(current);
  const unsaved = useRef<Sketch | undefined>(undefined);

  const flush = useCallback(() => {
    if (unsaved.current === undefined) return;
    save(unsaved.current);
    saved.current = unsaved.current;
    unsaved.current = undefined;
  }, [save]);

  useEffect(() => {
    unsaved.current = current === saved.current ? undefined : current;
    const timer = setTimeout(flush, autosaveDelay);
    return () => clearTimeout(timer);
  }, [current, flush]);

  useEffect(() => {
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);
}
