import {
  createEditor,
  update,
  type EditorState,
  type Input,
  type Point,
  type PointerInput,
  type Tool,
} from "./editor";
import { fixedWidthTextMeasurer, sequentialIds } from "./fakes";

const noModifiers = { shift: false, alt: false, ctrl: false, meta: false };

export const newEditor = (): EditorState =>
  createEditor({ measureText: fixedWidthTextMeasurer, generateId: sequentialIds });

export const apply = (state: EditorState, ...inputs: readonly Input[]): EditorState =>
  inputs.reduce(update, state);

export const selectTool = (tool: Tool): Input => ({ type: "selectTool", tool });

const pointer =
  (type: PointerInput["type"]) =>
  (position: Point): Input => ({ type, position, button: 0, modifiers: noModifiers });

export const pointerDown = pointer("pointerDown");
export const pointerMove = pointer("pointerMove");
export const pointerUp = pointer("pointerUp");

export const drawRectangle = (state: EditorState, from: Point, to: Point): EditorState =>
  apply(state, selectTool("rectangle"), pointerDown(from), pointerMove(to), pointerUp(to));
