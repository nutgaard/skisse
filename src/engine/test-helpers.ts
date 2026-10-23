import {
  createEditor,
  update,
  type EditorState,
  type Input,
  type Modifiers,
  type PointerInput,
  type Tool,
} from "./editor";
import type { Point } from "./geometry";
import { fixedWidthTextMeasurer, sequentialIds } from "./fakes";

const noModifiers: Modifiers = { shift: false, alt: false, ctrl: false, meta: false };

export const newEditor = (): EditorState =>
  createEditor({ measureText: fixedWidthTextMeasurer, generateId: sequentialIds });

export const apply = (state: EditorState, ...inputs: readonly Input[]): EditorState =>
  inputs.reduce(update, state);

export const selectTool = (tool: Tool): Input => ({ type: "selectTool", tool });

const pointer =
  (type: PointerInput["type"]) =>
  (position: Point, modifiers: Partial<Modifiers> = {}): Input => ({
    type,
    position,
    button: 0,
    modifiers: { ...noModifiers, ...modifiers },
  });

export const pointerDown = pointer("pointerDown");
export const pointerMove = pointer("pointerMove");
export const pointerUp = pointer("pointerUp");
export const pointerCancel = pointer("pointerCancel");

export const keyDown = (key: string, modifiers: Partial<Modifiers> = {}): Input => ({
  type: "keyDown",
  key,
  modifiers: { ...noModifiers, ...modifiers },
});

export const drawRectangle = (state: EditorState, from: Point, to: Point): EditorState =>
  apply(state, selectTool("rectangle"), pointerDown(from), pointerMove(to), pointerUp(to));

export const click = (state: EditorState, at: Point, modifiers: Partial<Modifiers> = {}): EditorState =>
  apply(state, selectTool("select"), pointerDown(at, modifiers), pointerUp(at, modifiers));

export const drag = (state: EditorState, from: Point, to: Point, modifiers: Partial<Modifiers> = {}): EditorState =>
  apply(
    state,
    selectTool("select"),
    pointerDown(from, modifiers),
    pointerMove(to, modifiers),
    pointerUp(to, modifiers),
  );

export const press = (state: EditorState, key: string, modifiers: Partial<Modifiers> = {}): EditorState =>
  apply(state, keyDown(key, modifiers));
