import { boundsBetween, type Bounds, type EditorState, type ShapeId, type SymbolId, type Tool } from "./editor";

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

export type InteractionView =
  | { readonly kind: "idle" }
  | { readonly kind: "creatingShape"; readonly symbol: SymbolId; readonly bounds: Bounds };

export const currentInteraction = (state: EditorState): InteractionView => {
  const { interaction } = state;
  switch (interaction.kind) {
    case "idle":
      return { kind: "idle" };
    case "creatingShape":
      return {
        kind: "creatingShape",
        symbol: interaction.symbol,
        bounds: boundsBetween(interaction.origin, interaction.current),
      };
  }
};
