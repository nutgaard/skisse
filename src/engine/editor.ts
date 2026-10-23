import {
  boundsBetween,
  boundsOfSpans,
  contains,
  containsBounds,
  enclosingBounds,
  sideOf,
  spanAtLeast,
  translate,
  type Bounds,
  type Point,
  type Span,
} from "./geometry";
import { gridSize, nextGridLine, snapToGrid } from "./grid";
import * as history from "./history";
import { handlePositions, resizeBounds, type ResizeHandle } from "./resize";

export type Modifiers = {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
};

export type SymbolId = "rectangle";

export type Tool = "select" | SymbolId;

export type PointerInput = {
  readonly type: "pointerDown" | "pointerMove" | "pointerUp" | "pointerCancel";
  readonly position: Point;
  readonly button: number;
  readonly modifiers: Modifiers;
};

export type KeyInput = {
  readonly type: "keyDown" | "keyUp";
  readonly key: string;
  readonly modifiers: Modifiers;
};

export type Input =
  | { readonly type: "selectTool"; readonly tool: Tool }
  | PointerInput
  | KeyInput
  | { readonly type: "undo" | "redo" };

export type TextMeasurer = (text: string, fontSize: number) => number;

export type ShapeId = string;

/** Turns the editor's running sequence number into a Shape ID. Must give a different ID for every number. */
export type IdGenerator = (sequence: number) => ShapeId;

export type Dependencies = {
  readonly measureText: TextMeasurer;
  readonly generateId: IdGenerator;
};

export type SymbolShape = {
  readonly id: ShapeId;
  readonly symbol: SymbolId;
  readonly bounds: Bounds;
};

export type Sketch = {
  readonly shapes: Readonly<Record<ShapeId, SymbolShape>>;
};

// A drag on the Sketch: where it started, where the pointer is now, and the Sketch at the start. Each pointer move
// is applied to that Sketch afresh, and cancelling restores it. `dragged` is set once the pointer first travels
// past the drag threshold, and stays set even if the pointer comes back.
type Drag = { readonly origin: Point; readonly current: Point; readonly before: Sketch; readonly dragged: boolean };

type Interaction =
  | { readonly kind: "idle" }
  | {
      readonly kind: "creatingShape";
      readonly symbol: SymbolId;
      readonly origin: Point;
      readonly current: Point;
      readonly snaps: boolean;
    }
  | {
      readonly kind: "marqueeSelecting";
      readonly origin: Point;
      readonly current: Point;
      // The selection before the marquee was started: kept by a shift-drag, and restored when it is cancelled.
      readonly previousSelection: readonly ShapeId[];
      readonly additive: boolean;
    }
  | ({
      readonly kind: "moving";
      // A press on one of several selected Shapes keeps them all selected so they can be dragged together,
      // but a click there without dragging selects just that Shape.
      readonly selectsOnClick: ShapeId | undefined;
    } & Drag)
  | ({ readonly kind: "resizing"; readonly shapeId: ShapeId; readonly handle: ResizeHandle } & Drag);

export type EditorState = {
  readonly deps: Dependencies;
  readonly sketch: Sketch;
  readonly tool: Tool;
  readonly selection: readonly ShapeId[];
  readonly interaction: Interaction;
  readonly nextIdSequence: number;
  // Earlier and undone Sketches. Only changes to the Sketch are recorded, one step per finished gesture or command.
  readonly history: history.History<Sketch>;
};

const idle: Interaction = { kind: "idle" };

// How far, in screen pixels, the pointer must travel before a press on a Shape or a resize handle becomes a drag,
// so a click never nudges or snaps a Shape by accident.
const dragThreshold = 3;

const minimumShapeSize = 10;

/**
 * The Bounds of a Shape drawn by dragging from `origin` to `current`, never smaller than the minimum size. When
 * snapping, both corners snap to the grid, but the Shape still grows the way the pointer went from where it started.
 */
export const drawnBounds = (origin: Point, current: Point, snaps: boolean): Bounds => {
  const snap = snapperFor(snaps);
  const span = (from: number, to: number): Span =>
    spanAtLeast(snap(from), snap(to), sideOf(from, to, 1), minimumShapeSize);
  return boundsOfSpans(span(origin.x, current.x), span(origin.y, current.y));
};

// How far, in screen pixels, from a resize handle's centre a press still grabs it.
const handleReach = 6;

// Snapping to the grid is off by default. Holding Alt turns it on, for drags, resizes and arrow keys alike.
const snapsToGrid = (modifiers: Modifiers): boolean => modifiers.alt;

const snapperFor = (snaps: boolean): ((value: number) => number) => (snaps ? snapToGrid : (value) => value);

const emptySketch: Sketch = { shapes: {} };

export const createEditor = (deps: Dependencies): EditorState => ({
  deps,
  sketch: emptySketch,
  tool: "select",
  selection: [],
  interaction: idle,
  nextIdSequence: 1,
  history: history.startHistory(emptySketch),
});

// Shapes are hit-tested as if filled, even with a transparent fill. The topmost Shape wins.
const shapeAt = (sketch: Sketch, point: Point): SymbolShape | undefined =>
  Object.values(sketch.shapes).findLast((shape) => contains(shape.bounds, point));

const shapesInside = (sketch: Sketch, box: Bounds): readonly ShapeId[] =>
  Object.values(sketch.shapes)
    .filter((shape) => containsBounds(box, shape.bounds))
    .map(({ id }) => id);

const union = (a: readonly ShapeId[], b: readonly ShapeId[]): readonly ShapeId[] => [
  ...a,
  ...b.filter((id) => !a.includes(id)),
];

const toggle = (ids: readonly ShapeId[], id: ShapeId): readonly ShapeId[] =>
  ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];

const startMarquee = (state: EditorState, input: PointerInput): EditorState => {
  const additive = input.modifiers.shift;
  return {
    ...state,
    selection: additive ? state.selection : [],
    interaction: {
      kind: "marqueeSelecting",
      origin: input.position,
      current: input.position,
      previousSelection: state.selection,
      additive,
    },
  };
};

/** The one selected Shape, which is the only time resize handles are shown. */
export const resizableShape = (state: EditorState): SymbolShape | undefined => {
  const [id, ...others] = state.selection;
  return id !== undefined && others.length === 0 ? state.sketch.shapes[id] : undefined;
};

const handleAt = (state: EditorState, point: Point): { shape: SymbolShape; handle: ResizeHandle } | undefined => {
  const shape = resizableShape(state);
  const nearby = shape
    ? handlePositions(shape.bounds).find(
        ({ position }) => Math.abs(position.x - point.x) <= handleReach && Math.abs(position.y - point.y) <= handleReach,
      )
    : undefined;
  return shape && nearby ? { shape, handle: nearby.handle } : undefined;
};

const pressWithSelectTool = (state: EditorState, input: PointerInput): EditorState => {
  const grabbedHandle = handleAt(state, input.position);
  if (grabbedHandle) {
    return {
      ...state,
      interaction: {
        kind: "resizing",
        shapeId: grabbedHandle.shape.id,
        handle: grabbedHandle.handle,
        origin: input.position,
        current: input.position,
        before: state.sketch,
        dragged: false,
      },
    };
  }
  const hit = shapeAt(state.sketch, input.position);
  if (!hit) return startMarquee(state, input);
  const { shift } = input.modifiers;
  const selection = shift ? toggle(state.selection, hit.id) : state.selection.includes(hit.id) ? state.selection : [hit.id];
  if (!selection.includes(hit.id)) return { ...state, selection };
  return {
    ...state,
    selection,
    interaction: {
      kind: "moving",
      selectsOnClick: shift ? undefined : hit.id,
      origin: input.position,
      current: input.position,
      before: state.sketch,
      dragged: false,
    },
  };
};

const moveShapes = (sketch: Sketch, ids: readonly ShapeId[], offset: Point): Sketch => ({
  ...sketch,
  shapes: {
    ...sketch.shapes,
    ...Object.fromEntries(
      ids
        .map((id) => sketch.shapes[id])
        .filter((shape) => shape !== undefined)
        .map((shape) => [shape.id, { ...shape, bounds: translate(shape.bounds, offset) }]),
    ),
  },
});

// The Bounds around the selection, which moves as one block.
const selectionBlock = (sketch: Sketch, selection: readonly ShapeId[]): Bounds =>
  enclosingBounds(selection.flatMap((id) => sketch.shapes[id]?.bounds ?? []));

// Where the pointer is and which modifiers are held: all a drag needs, whether from a pointer move or a key press.
type PointerState = Pick<PointerInput, "position" | "modifiers">;

// The drag with the pointer at `pointer`, noting whether it has now travelled past the drag threshold.
const continueDrag = <D extends Drag>(drag: D, pointer: PointerState): D => ({
  ...drag,
  current: pointer.position,
  dragged:
    drag.dragged ||
    Math.hypot(pointer.position.x - drag.origin.x, pointer.position.y - drag.origin.y) >= dragThreshold,
});

// Zero until the pointer has travelled past the drag threshold.
const pointerOffset = (drag: Drag, pointer: PointerState): Point =>
  drag.dragged ? { x: pointer.position.x - drag.origin.x, y: pointer.position.y - drag.origin.y } : { x: 0, y: 0 };

// The block's top-left corner snaps to the grid, so the Shapes keep their distances.
const dragOffset = (state: EditorState, drag: Drag, pointer: PointerState): Point => {
  const offset = pointerOffset(drag, pointer);
  if (!drag.dragged || !snapsToGrid(pointer.modifiers)) return offset;
  const block = selectionBlock(drag.before, state.selection);
  return {
    x: snapToGrid(block.x + offset.x) - block.x,
    y: snapToGrid(block.y + offset.y) - block.y,
  };
};

const resizeShape = (
  state: EditorState,
  interaction: Extract<Interaction, { kind: "resizing" }>,
  pointer: PointerState,
): EditorState => {
  const { before, shapeId, handle } = interaction;
  const shape = before.shapes[shapeId];
  if (!shape || !interaction.dragged) return { ...state, sketch: before, interaction };
  const bounds = resizeBounds(shape.bounds, handle, pointerOffset(interaction, pointer), {
    snap: snapperFor(snapsToGrid(pointer.modifiers)),
    keepAspectRatio: pointer.modifiers.shift,
    minimumSize: minimumShapeSize,
  });
  return {
    ...state,
    sketch: { ...before, shapes: { ...before.shapes, [shapeId]: { ...shape, bounds } } },
    interaction,
  };
};

const dragTo = (
  state: EditorState,
  interaction: Extract<Interaction, { kind: "moving" | "resizing" }>,
  pointer: PointerState,
): EditorState => {
  switch (interaction.kind) {
    case "moving": {
      const drag = continueDrag(interaction, pointer);
      return {
        ...state,
        sketch: moveShapes(drag.before, state.selection, dragOffset(state, drag, pointer)),
        interaction: drag,
      };
    }
    case "resizing":
      return resizeShape(state, continueDrag(interaction, pointer), pointer);
  }
};

const pointerDown = (state: EditorState, input: PointerInput): EditorState =>
  state.tool === "select"
    ? pressWithSelectTool(state, input)
    : {
        ...state,
        interaction: {
          kind: "creatingShape",
          symbol: state.tool,
          origin: input.position,
          current: input.position,
          snaps: snapsToGrid(input.modifiers),
        },
      };

const pointerMove = (state: EditorState, input: PointerInput): EditorState => {
  const { interaction } = state;
  switch (interaction.kind) {
    case "idle":
      return state;
    case "creatingShape":
      return {
        ...state,
        interaction: { ...interaction, current: input.position, snaps: snapsToGrid(input.modifiers) },
      };
    case "marqueeSelecting": {
      const inside = shapesInside(state.sketch, boundsBetween(interaction.origin, input.position));
      return {
        ...state,
        selection: interaction.additive ? union(interaction.previousSelection, inside) : inside,
        interaction: { ...interaction, current: input.position },
      };
    }
    case "moving":
    case "resizing":
      return dragTo(state, interaction, input);
  }
};

const addShape = (sketch: Sketch, shape: SymbolShape): Sketch => ({
  ...sketch,
  shapes: { ...sketch.shapes, [shape.id]: shape },
});

// A new Shape becomes the selection, so it can be adjusted straight away.
const createShape = (state: EditorState, symbol: SymbolId, bounds: Bounds): EditorState => {
  const shape: SymbolShape = { id: state.deps.generateId(state.nextIdSequence), symbol, bounds };
  return {
    ...state,
    sketch: addShape(state.sketch, shape),
    selection: [shape.id],
    nextIdSequence: state.nextIdSequence + 1,
  };
};

const pointerUp = (state: EditorState, input: PointerInput): EditorState => {
  const moved = pointerMove(state, input);
  const { interaction } = moved;
  const finished: EditorState = { ...moved, interaction: idle };
  switch (interaction.kind) {
    case "creatingShape":
      return createShape(
        finished,
        interaction.symbol,
        drawnBounds(interaction.origin, interaction.current, interaction.snaps),
      );
    case "moving": {
      const clicked = interaction.dragged ? undefined : interaction.selectsOnClick;
      return clicked === undefined ? finished : { ...finished, selection: [clicked] };
    }
    case "idle":
    case "marqueeSelecting":
    case "resizing":
      return finished;
  }
};

const cancelGesture = (state: EditorState): EditorState => {
  const { interaction } = state;
  const cancelled: EditorState = { ...state, interaction: idle };
  switch (interaction.kind) {
    case "idle":
    case "creatingShape":
      return cancelled;
    case "marqueeSelecting":
      return { ...cancelled, selection: interaction.previousSelection };
    case "moving":
    case "resizing":
      return { ...cancelled, sketch: interaction.before };
  }
};

const nudgeDirections: Readonly<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

// A nudge moves by one unit, or by one grid step with shift. With snapping on, it moves the selection's top-left
// corner to the next grid line instead.
const nudgeOffset = (state: EditorState, direction: Point, modifiers: Modifiers): Point => {
  if (!snapsToGrid(modifiers)) {
    const step = modifiers.shift ? gridSize : 1;
    return { x: direction.x * step, y: direction.y * step };
  }
  const block = selectionBlock(state.sketch, state.selection);
  return {
    x: direction.x === 0 ? 0 : nextGridLine(block.x, direction.x) - block.x,
    y: direction.y === 0 ? 0 : nextGridLine(block.y, direction.y) - block.y,
  };
};

const nudge = (state: EditorState, direction: Point, modifiers: Modifiers): EditorState =>
  state.selection.length === 0
    ? state
    : { ...state, sketch: moveShapes(state.sketch, state.selection, nudgeOffset(state, direction, modifiers)) };

const deleteSelection = (state: EditorState): EditorState => ({
  ...state,
  sketch: {
    ...state.sketch,
    shapes: Object.fromEntries(Object.entries(state.sketch.shapes).filter(([id]) => !state.selection.includes(id))),
  },
  selection: [],
});

// Pressing or releasing a modifier mid-drag, such as Alt for snapping, applies to the drag straight away,
// without waiting for the pointer to move.
const updateDragModifiers = (state: EditorState, modifiers: Modifiers): EditorState => {
  const { interaction } = state;
  switch (interaction.kind) {
    case "creatingShape":
      return { ...state, interaction: { ...interaction, snaps: snapsToGrid(modifiers) } };
    case "moving":
    case "resizing":
      return dragTo(state, interaction, { position: interaction.current, modifiers });
    case "idle":
    case "marqueeSelecting":
      return state;
  }
};

const keyDown = (state: EditorState, input: KeyInput): EditorState => {
  if (input.key === "Escape") {
    return state.interaction.kind === "idle" ? { ...state, selection: [] } : cancelGesture(state);
  }
  if (state.interaction.kind !== "idle") return updateDragModifiers(state, input.modifiers);
  const command = input.modifiers.meta || input.modifiers.ctrl;
  if (command && input.key.toLowerCase() === "a") {
    return { ...state, selection: Object.keys(state.sketch.shapes) };
  }
  if (command && input.key.toLowerCase() === "z") return input.modifiers.shift ? redo(state) : undo(state);
  if (input.key === "Delete" || input.key === "Backspace") return deleteSelection(state);
  const direction = nudgeDirections[input.key];
  if (direction) return nudge(state, direction, input.modifiers);
  return state;
};

// Puts back the Sketch the history now holds. Shapes that no longer exist drop out of the selection.
const restore = (state: EditorState, restored: history.History<Sketch>): EditorState => ({
  ...state,
  sketch: restored.present,
  selection: state.selection.filter((id) => restored.present.shapes[id] !== undefined),
  history: restored,
});

const undo = (state: EditorState): EditorState => restore(state, history.undo(state.history));

const redo = (state: EditorState): EditorState => restore(state, history.redo(state.history));

const step = (state: EditorState, input: Input): EditorState => {
  switch (input.type) {
    case "selectTool":
      return { ...state, tool: input.tool };
    case "pointerDown":
      return pointerDown(state, input);
    case "pointerMove":
      return pointerMove(state, input);
    case "pointerUp":
      return pointerUp(state, input);
    case "pointerCancel":
      return cancelGesture(state);
    case "keyDown":
      return keyDown(state, input);
    case "keyUp":
      return updateDragModifiers(state, input.modifiers);
    case "undo":
      return state.interaction.kind === "idle" ? undo(state) : state;
    case "redo":
      return state.interaction.kind === "idle" ? redo(state) : state;
  }
};

// A change to the Sketch is recorded once the editor is idle again, so a whole gesture is one step and a cancelled
// one, which puts the Sketch back, records nothing.
export const update = (state: EditorState, input: Input): EditorState => {
  const next = step(state, input);
  return next.interaction.kind === "idle" ? { ...next, history: history.record(next.history, next.sketch) } : next;
};
