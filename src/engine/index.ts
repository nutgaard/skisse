export { createEditor, update } from "./editor";
export type { Bounds, Point } from "./geometry";
export type {
  Dependencies,
  EditorState,
  IdGenerator,
  Input,
  KeyInput,
  Modifiers,
  PointerInput,
  ShapeId,
  SymbolId,
  TextMeasurer,
  Tool,
} from "./editor";
export type { Handle } from "./resize";
export { activeTool, currentInteraction, resizeHandles, selection, shapes } from "./queries";
export type { HandleView, InteractionView, ShapeView } from "./queries";
