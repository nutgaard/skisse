import type { Sketch, Viewport } from "../engine";

export type SketchId = string;

/** A Sketch as it appears in the Sketch list. */
export type SketchEntry = { readonly id: SketchId; readonly name: string };

/** Where Sketches are kept between sessions. The name of a Sketch is kept apart from its Shapes. */
export type SketchStore = {
  /** Every Sketch, oldest first. */
  readonly list: () => readonly SketchEntry[];
  /**
   * Adds `sketch` as a new entry named `name`, told apart by a number when another Sketch has that name already. Without
   * a name, it gets one of its own.
   */
  readonly create: (sketch: Sketch, name?: string) => SketchEntry;
  readonly load: (id: SketchId) => Sketch | undefined;
  /** Saves over an existing Sketch. A deleted Sketch stays deleted, so a late save can't bring it back. */
  readonly save: (id: SketchId, sketch: Sketch) => void;
  readonly rename: (id: SketchId, name: string) => void;
  /**
   * Where the Sketch was shown when last open, or for one imported from a file, where it was shown when exported. It
   * is kept apart from the Sketch, so it is never undone.
   */
  readonly loadViewport: (id: SketchId) => Viewport | undefined;
  /** Like `save`, ignored for a deleted Sketch. */
  readonly saveViewport: (id: SketchId, viewport: Viewport) => void;
  /** Deletes the Sketch and its viewport. */
  readonly delete: (id: SketchId) => void;
  /** The Sketch opened last, so it can be opened again after a reload. */
  readonly lastOpened: () => SketchId | undefined;
  readonly rememberOpened: (id: SketchId) => void;
};
