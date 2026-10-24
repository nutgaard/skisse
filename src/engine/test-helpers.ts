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
import type { SymbolId } from "./symbols";
import type { Tool } from "./tools";
import type { Size } from "./viewport";

export function newEditor(sketch?: Sketch): EditorState {
  return createEditor({ measureText: fixedWidthTextMeasurer, generateId: sequentialIds }, sketch);
}

export function apply(state: EditorState, ...inputs: readonly Input[]): EditorState {
  return inputs.reduce(update, state);
}

export function selectTool(tool: Tool): Input {
  return { type: "selectTool", tool };
}

export const undoInput: Input = { type: "undo" };

export const redoInput: Input = { type: "redo" };

function pointer(type: PointerInput["type"]) {
  return (position: Point, modifiers: Partial<Modifiers> = {}): Input => ({
    type,
    position,
    button: 0,
    modifiers: { ...noModifiers, ...modifiers },
  });
}

export function wheel(position: Point, delta: Point, modifiers: Partial<Modifiers> = {}): Input {
  return {
    type: "wheel",
    position,
    delta,
    modifiers: { ...noModifiers, ...modifiers },
  };
}

export function zoomToFit(screenSize: Size): Input {
  return { type: "zoomToFit", screenSize };
}

export function resetZoom(screenSize: Size): Input {
  return { type: "resetZoom", screenSize };
}

export function pinch(position: Point, scale: number): Input {
  return { type: "pinch", position, scale };
}

export const pointerDown = pointer("pointerDown");
export const pointerMove = pointer("pointerMove");
export const pointerUp = pointer("pointerUp");
export const pointerCancel = pointer("pointerCancel");

function keyboard(type: KeyInput["type"]) {
  return (key: string, modifiers: Partial<Modifiers> = {}): Input => ({
    type,
    key,
    modifiers: { ...noModifiers, ...modifiers },
  });
}

export const keyDown = keyboard("keyDown");
export const keyUp = keyboard("keyUp");

/** Draws a Shape of `symbol` by dragging from `from` to `to`, which leaves its Label open for editing. */
export function drawWithLabelOpen(state: EditorState, symbol: SymbolId, from: Point, to: Point): EditorState {
  return apply(state, selectTool(symbol), pointerDown(from), pointerMove(to), pointerUp(to));
}

/** Draws a Shape of `symbol` by dragging from `from` to `to`, types `text` as its Label, and commits it with Escape. */
export function drawLabelled(state: EditorState, symbol: SymbolId, from: Point, to: Point, text: string): EditorState {
  return press(typeLabel(drawWithLabelOpen(state, symbol, from, to), text), "Escape");
}

/** Draws a Shape of `symbol` by dragging from `from` to `to`, and finishes editing its Label, leaving it empty. */
export function drawSymbol(state: EditorState, symbol: SymbolId, from: Point, to: Point): EditorState {
  return apply(drawWithLabelOpen(state, symbol, from, to), keyDown("Escape"));
}

export function drawRectangle(state: EditorState, from: Point, to: Point): EditorState {
  return drawSymbol(state, "rectangle", from, to);
}

/**
 * The Sketch point shown at the screen point `at`, found by clicking there with the rectangle tool, which centres the
 * new Shape on it.
 */
export function sketchPointUnder(state: EditorState, at: Point): Point {
  const created = apply(state, selectTool("rectangle"), pointerDown(at), pointerUp(at));
  const [id] = selection(created);
  const shape = shapes(created).find((candidate) => candidate.id === id);
  if (!shape) throw new Error("clicking with the rectangle tool created no Shape");
  return { x: shape.bounds.x + shape.bounds.width / 2, y: shape.bounds.y + shape.bounds.height / 2 };
}

export function click(state: EditorState, at: Point, modifiers: Partial<Modifiers> = {}): EditorState {
  return apply(state, selectTool("select"), pointerDown(at, modifiers), pointerUp(at, modifiers));
}

/** Two clicks in a row, then the double-click the browser reports for them. */
export function doubleClick(state: EditorState, at: Point): EditorState {
  return apply(click(click(state, at), at), { type: "doubleClick", position: at });
}

export function drag(state: EditorState, from: Point, to: Point, modifiers: Partial<Modifiers> = {}): EditorState {
  return apply(
    state,
    selectTool("select"),
    pointerDown(from, modifiers),
    pointerMove(to, modifiers),
    pointerUp(to, modifiers),
  );
}

/** Replaces the text of the Label being edited, as typing into the Label's text field does. */
export function typeLabel(state: EditorState, text: string): EditorState {
  return apply(state, { type: "changeLabelText", text });
}

export function press(state: EditorState, key: string, modifiers: Partial<Modifiers> = {}): EditorState {
  return apply(state, keyDown(key, modifiers));
}

/** shape-1 at (100,100)–(200,180) and shape-2 at (300,100)–(400,180), both 100 wide, 80 high and on the grid. */
export function twoRectangles(): EditorState {
  return drawRectangle(
    drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }),
    { x: 300, y: 100 },
    { x: 400, y: 180 },
  );
}

export function boundsById(state: EditorState) {
  return Object.fromEntries(shapes(state).map(({ id, bounds }) => [id, bounds]));
}
