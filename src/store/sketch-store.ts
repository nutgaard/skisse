import type { Sketch } from "../engine";

export type SketchId = string;

/** A Sketch as it appears in the Sketch list. */
export type SketchEntry = { readonly id: SketchId; readonly name: string };

/** Where Sketches are kept between sessions. The name of a Sketch is kept apart from its Shapes. */
export type SketchStore = {
  /** Every Sketch, oldest first. */
  readonly list: () => readonly SketchEntry[];
  /** Adds `sketch` as a new entry with a name of its own. */
  readonly create: (sketch: Sketch) => SketchEntry;
  readonly load: (id: SketchId) => Sketch | undefined;
  /** Saves over an existing Sketch. A deleted Sketch stays deleted, so a late save can't bring it back. */
  readonly save: (id: SketchId, sketch: Sketch) => void;
  readonly rename: (id: SketchId, name: string) => void;
  readonly delete: (id: SketchId) => void;
  /** The Sketch opened last, so it can be opened again after a reload. */
  readonly lastOpened: () => SketchId | undefined;
  readonly rememberOpened: (id: SketchId) => void;
};
