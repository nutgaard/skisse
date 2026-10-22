import type { Bounds, EditorState, ShapeId, SymbolId, Tool } from "./editor";

// What queries return about a Shape. Kept apart from the stored SymbolShape so the stored model can change
// without changing what the view and the tests see.
export type ShapeView = {
  readonly id: ShapeId;
  readonly symbol: SymbolId;
  readonly bounds: Bounds;
};

export const shapes = (state: EditorState): readonly ShapeView[] =>
  Object.values(state.sketch.shapes).map(({ id, symbol, bounds }) => ({ id, symbol, bounds }));

export const activeTool = (state: EditorState): Tool => state.tool;
