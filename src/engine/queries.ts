import {
  creationBounds,
  resizableShape,
  type EditorState,
  type ShapeId,
  type Sketch,
} from "./editor";
import { boundsBetween, type Bounds, type Point } from "./geometry";
import * as history from "./history";
import { handlePositions, type ResizeHandle } from "./resize";
import type { SymbolId } from "./symbols";
import type { Tool } from "./tools";
import type { Viewport } from "./viewport";

export { pansOnPress } from "./editor";

// What queries return about a Shape. Kept apart from the stored SymbolShape so the stored model can change
// without changing what the view and the tests see.
export type ShapeView = {
  readonly id: ShapeId;
  readonly symbol: SymbolId;
  readonly bounds: Bounds;
};

export const shapes = (state: EditorState): readonly ShapeView[] =>
  Object.values(state.sketch.shapes).map(({ id, symbol, bounds }) => ({ id, symbol, bounds }));

/** The Sketch as of the last finished change, leaving out any gesture still in progress. This is what to save. */
export const sketch = (state: EditorState): Sketch => state.history.present;

export const selection = (state: EditorState): readonly ShapeId[] => state.selection;

export type HandleView = { readonly handle: ResizeHandle; readonly position: Point };

export const resizeHandles = (state: EditorState): readonly HandleView[] => {
  const shape = resizableShape(state);
  return shape ? handlePositions(shape.bounds) : [];
};

export const canUndo = (state: EditorState): boolean => history.canUndo(state.history);

export const canRedo = (state: EditorState): boolean => history.canRedo(state.history);

export const viewport = (state: EditorState): Viewport => state.viewport;

export const activeTool = (state: EditorState): Tool => state.tool;

export type InteractionView =
  | { readonly kind: "idle" }
  // Pressed with a Symbol tool, but not dragged yet. Releasing places a default-size Shape, but nothing is shown until
  // then, as the press may still become a drag.
  | { readonly kind: "placingShape"; readonly symbol: SymbolId }
  | { readonly kind: "creatingShape"; readonly symbol: SymbolId; readonly bounds: Bounds }
  | { readonly kind: "marqueeSelecting"; readonly bounds: Bounds }
  | { readonly kind: "moving" }
  | { readonly kind: "resizing"; readonly handle: ResizeHandle }
  | { readonly kind: "panning" };

export const currentInteraction = (state: EditorState): InteractionView => {
  const { interaction } = state;
  switch (interaction.kind) {
    case "idle":
      return { kind: "idle" };
    case "creatingShape":
      return interaction.dragged
        ? { kind: "creatingShape", symbol: interaction.symbol, bounds: creationBounds(interaction) }
        : { kind: "placingShape", symbol: interaction.symbol };
    case "marqueeSelecting":
      return { kind: "marqueeSelecting", bounds: boundsBetween(interaction.origin, interaction.current) };
    case "moving":
      return { kind: "moving" };
    case "resizing":
      return { kind: "resizing", handle: interaction.handle };
    case "panning":
      return { kind: "panning" };
  }
};
