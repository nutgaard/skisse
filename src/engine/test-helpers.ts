import {
  createEditor,
  noModifiers,
  update,
  type EditorState,
  type Input,
  type KeyInput,
  type Modifiers,
  type PointerInput,
  type Sketch,
} from "./editor";
import type { Point } from "./geometry";
import { fixedWidthTextMeasurer, sequentialIds } from "./fakes";
import { selection, shapes } from "./queries";
import type { Tool } from "./tools";
import type { Size } from "./viewport";

export const newEditor = (sketch?: Sketch): EditorState =>
  createEditor({ measureText: fixedWidthTextMeasurer, generateId: sequentialIds }, sketch);

export const apply = (state: EditorState, ...inputs: readonly Input[]): EditorState =>
  inputs.reduce(update, state);

export const selectTool = (tool: Tool): Input => ({ type: "selectTool", tool });

export const undoInput: Input = { type: "undo" };

export const redoInput: Input = { type: "redo" };

const pointer =
  (type: PointerInput["type"]) =>
  (position: Point, modifiers: Partial<Modifiers> = {}): Input => ({
    type,
    position,
    button: 0,
    modifiers: { ...noModifiers, ...modifiers },
  });

export const wheel = (position: Point, delta: Point, modifiers: Partial<Modifiers> = {}): Input => ({
  type: "wheel",
  position,
  delta,
  modifiers: { ...noModifiers, ...modifiers },
});

export const zoomToFit = (screenSize: Size): Input => ({ type: "zoomToFit", screenSize });

export const resetZoom = (screenSize: Size): Input => ({ type: "resetZoom", screenSize });

export const pinch = (position: Point, scale: number): Input => ({ type: "pinch", position, scale });

export const pointerDown = pointer("pointerDown");
export const pointerMove = pointer("pointerMove");
export const pointerUp = pointer("pointerUp");
export const pointerCancel = pointer("pointerCancel");

const keyboard =
  (type: KeyInput["type"]) =>
  (key: string, modifiers: Partial<Modifiers> = {}): Input => ({ type, key, modifiers: { ...noModifiers, ...modifiers } });

export const keyDown = keyboard("keyDown");
export const keyUp = keyboard("keyUp");

export const drawRectangle = (state: EditorState, from: Point, to: Point): EditorState =>
  apply(state, selectTool("rectangle"), pointerDown(from), pointerMove(to), pointerUp(to));

/**
 * The Sketch point shown at the screen point `at`, found by clicking there with the rectangle tool, which centres the
 * new Shape on it.
 */
export const sketchPointUnder = (state: EditorState, at: Point): Point => {
  const created = apply(state, selectTool("rectangle"), pointerDown(at), pointerUp(at));
  const [id] = selection(created);
  const shape = shapes(created).find((candidate) => candidate.id === id);
  if (!shape) throw new Error("clicking with the rectangle tool created no Shape");
  return { x: shape.bounds.x + shape.bounds.width / 2, y: shape.bounds.y + shape.bounds.height / 2 };
};

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

/** shape-1 at (100,100)–(200,180) and shape-2 at (300,100)–(400,180), both 100 wide, 80 high and on the grid. */
export const twoRectangles = (): EditorState =>
  drawRectangle(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }), { x: 300, y: 100 }, { x: 400, y: 180 });

export const boundsById = (state: EditorState) => Object.fromEntries(shapes(state).map(({ id, bounds }) => [id, bounds]));
