import { emptySketch, type Sketch } from "../engine";
import type { SketchId, SketchStore } from "./sketch-store";

export type OpenSketch = { readonly id: SketchId; readonly sketch: Sketch };

const openNew = (store: SketchStore): OpenSketch => ({ id: store.create(emptySketch).id, sketch: emptySketch });

/** Opens the first of `candidates` that is still in the store, or a new empty Sketch if none is, and remembers it. */
export const openFirst = (store: SketchStore, candidates: readonly (SketchId | undefined)[]): OpenSketch => {
  const opened =
    candidates
      .filter((id) => id !== undefined)
      .map((id) => ({ id, sketch: store.load(id) }))
      .find((candidate): candidate is OpenSketch => candidate.sketch !== undefined) ?? openNew(store);
  store.rememberOpened(opened.id);
  return opened;
};

/** Opens a new empty Sketch. */
export const openNewSketch = (store: SketchStore): OpenSketch => openFirst(store, []);

/** Opens the Sketch opened last, or else the oldest one. On first start, a new empty Sketch. */
export const openOnStart = (store: SketchStore): OpenSketch =>
  openFirst(store, [store.lastOpened(), ...store.list().map(({ id }) => id)]);
