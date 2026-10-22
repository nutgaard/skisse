import { createEditor, update, type EditorState, type Input, type Point, type Tool } from "./editor";
import { fixedWidthTextMeasurer, sequentialIds } from "./fakes";

const noModifiers = { shift: false, alt: false, ctrl: false, meta: false };

export const newEditor = (): EditorState =>
  createEditor({ measureText: fixedWidthTextMeasurer(), generateId: sequentialIds() });

export const apply = (state: EditorState, ...inputs: readonly Input[]): EditorState =>
  inputs.reduce(update, state);

export const selectTool = (tool: Tool): Input => ({ type: "selectTool", tool });

export const pointerDown = (position: Point): Input => ({
  type: "pointerDown",
  position,
  button: 0,
  modifiers: noModifiers,
});

export const pointerMove = (position: Point): Input => ({
  type: "pointerMove",
  position,
  modifiers: noModifiers,
});

export const pointerUp = (position: Point): Input => ({
  type: "pointerUp",
  position,
  button: 0,
  modifiers: noModifiers,
});

export const drawRectangle = (state: EditorState, from: Point, to: Point): EditorState =>
  apply(state, selectTool("rectangle"), pointerDown(from), pointerMove(to), pointerUp(to));
