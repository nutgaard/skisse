import { drawnBounds, resizableShape, type EditorState, type ShapeId, type SymbolId, type Tool } from "./editor";
import { boundsBetween, type Bounds, type Point } from "./geometry";
import { handlePositions, type ResizeHandle } from "./resize";

// What queries return about a Shape. Kept apart from the stored SymbolShape so the stored model can change
// without changing what the view and the tests see.
export type ShapeView = {
  readonly id: ShapeId;
  readonly symbol: SymbolId;
  readonly bounds: Bounds;
};

export const shapes = (state: EditorState): readonly ShapeView[] =>
  Object.values(state.sketch.shapes).map(({ id, symbol, bounds }) => ({ id, symbol, bounds }));

export const selection = (state: EditorState): readonly ShapeId[] => state.selection;

export type HandleView = { readonly handle: ResizeHandle; readonly position: Point };

export const resizeHandles = (state: EditorState): readonly HandleView[] => {
  const shape = resizableShape(state);
  return shape ? handlePositions(shape.bounds) : [];
};

export const activeTool = (state: EditorState): Tool => state.tool;

export type InteractionView =
  | { readonly kind: "idle" }
  | { readonly kind: "creatingShape"; readonly symbol: SymbolId; readonly bounds: Bounds }
  | { readonly kind: "marqueeSelecting"; readonly bounds: Bounds }
  | { readonly kind: "moving" }
  | { readonly kind: "resizing"; readonly handle: ResizeHandle };

export const currentInteraction = (state: EditorState): InteractionView => {
  const { interaction } = state;
  switch (interaction.kind) {
    case "idle":
      return { kind: "idle" };
    case "creatingShape":
      return {
        kind: "creatingShape",
        symbol: interaction.symbol,
        bounds: drawnBounds(interaction.origin, interaction.current, interaction.snaps),
      };
    case "marqueeSelecting":
      return { kind: "marqueeSelecting", bounds: boundsBetween(interaction.origin, interaction.current) };
    case "moving":
      return { kind: "moving" };
    case "resizing":
      return { kind: "resizing", handle: interaction.handle };
  }
};
