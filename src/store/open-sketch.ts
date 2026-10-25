import { emptySketch, type Sketch } from "../engine";
import type { SketchId, SketchStore } from "./sketch-store";

export type OpenSketch = { readonly id: SketchId; readonly sketch: Sketch };

function remember(store: SketchStore, opened: OpenSketch): OpenSketch {
  store.rememberOpened(opened.id);
  return opened;
}

/** Opens `sketch`, such as one imported from a file, as a new entry named `name`, or with a name of its own. */
export function openAsNew(store: SketchStore, sketch: Sketch, name?: string): OpenSketch {
  return remember(store, { id: store.create(sketch, name).id, sketch });
}

/** Opens a new empty Sketch. */
export function openNew(store: SketchStore): OpenSketch {
  return openAsNew(store, emptySketch);
}

/** Opens the first of `candidates` that is still in the store, or a new empty Sketch if none is. */
export function openFirst(store: SketchStore, candidates: readonly (SketchId | undefined)[]): OpenSketch {
  const found = candidates
    .filter((id) => id !== undefined)
    .map((id) => ({ id, sketch: store.load(id) }))
    .find((candidate): candidate is OpenSketch => candidate.sketch !== undefined);
  return found ? remember(store, found) : openNew(store);
}

function allIds(store: SketchStore): readonly SketchId[] {
  return store.list().map(({ id }) => id);
}

/** Opens the Sketch opened last, or else the oldest one. On first start, a new empty Sketch. */
export function openOnStart(store: SketchStore): OpenSketch {
  return openFirst(store, [store.lastOpened(), ...allIds(store)]);
}

/**
 * Deletes a Sketch and gives the Sketch open afterwards: `open` itself, unless that was the one deleted, in which case
 * another one, or a new empty one.
 */
export function deleteSketch(store: SketchStore, id: SketchId, open: OpenSketch): OpenSketch {
  store.delete(id);
  return id === open.id ? openFirst(store, allIds(store)) : open;
}
