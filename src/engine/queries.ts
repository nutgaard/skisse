import type { Bounds, EditorState, SymbolId, Tool } from "./editor";

export type ShapeView = {
  readonly id: string;
  readonly symbol: SymbolId;
  readonly bounds: Bounds;
};

export const shapes = (state: EditorState): readonly ShapeView[] =>
  Object.values(state.sketch.shapes).map(({ id, symbol, bounds }) => ({ id, symbol, bounds }));

export const activeTool = (state: EditorState): Tool => state.tool;
