export { createEditor, update } from "./editor";
export type {
  Bounds,
  Dependencies,
  EditorState,
  IdGenerator,
  Input,
  KeyInput,
  Modifiers,
  Point,
  PointerInput,
  ShapeId,
  SymbolId,
  TextMeasurer,
  Tool,
} from "./editor";
export { activeTool, currentInteraction, shapes } from "./queries";
export type { InteractionView, ShapeView } from "./queries";
