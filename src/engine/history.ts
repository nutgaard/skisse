/**
 * The undo/redo history of a value, such as the Sketch. `present` is the value as last recorded; earlier values are
 * in `past` (most recent last) and undone ones in `future` (next to redo first).
 */
export type History<T> = {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
};

export function startHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records `value` as one step, unless it equals the present value. A new step discards what was undone. */
export function record<T>(history: History<T>, value: T): History<T> {
  return isEqual(history.present, value)
    ? history
    : { past: [...history.past, history.present], present: value, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  return previous === undefined
    ? history
    : { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  return next === undefined ? history : { past: [...history.past, history.present], present: next, future };
}

export function canUndo(history: History<unknown>): boolean {
  return history.past.length > 0;
}

export function canRedo(history: History<unknown>): boolean {
  return history.future.length > 0;
}

// Compares plain data structurally, so a gesture that ends where it began records nothing. Unchanged parts of
// immutable data are the same objects, which keeps this cheap.
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const aEntries = Object.entries(a);
  return (
    aEntries.length === Object.keys(b).length &&
    aEntries.every(([key, value]) => Object.hasOwn(b, key) && isEqual(value, (b as Record<string, unknown>)[key]))
  );
}
