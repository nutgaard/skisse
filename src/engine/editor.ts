import { boundsBetween, contains, containsBounds, enclosingBounds, translate, type Bounds, type Point } from "./geometry";
import { handlePositions, resizeBounds, type Handle } from "./resize";

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

export type Input = { readonly type: "selectTool"; readonly tool: Tool } | PointerInput | KeyInput;

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

type Interaction =
  | { readonly kind: "idle" }
  | {
      readonly kind: "creatingShape";
      readonly symbol: SymbolId;
      readonly origin: Point;
      readonly current: Point;
    }
  | {
      readonly kind: "selectingBox";
      readonly origin: Point;
      readonly current: Point;
      // The selection before the box was started: kept by a shift-drag, and restored when the box is cancelled.
      readonly previousSelection: readonly ShapeId[];
      readonly additive: boolean;
    }
  | {
      readonly kind: "moving";
      readonly origin: Point;
      // The Sketch when the drag started. Each pointer move is applied to it afresh, and Escape restores it.
      readonly before: Sketch;
    }
  | {
      readonly kind: "resizing";
      readonly shapeId: ShapeId;
      readonly handle: Handle;
      readonly origin: Point;
      // As for moving: the Sketch when the resize started.
      readonly before: Sketch;
    };

export type EditorState = {
  readonly deps: Dependencies;
  readonly sketch: Sketch;
  readonly tool: Tool;
  readonly selection: readonly ShapeId[];
  readonly interaction: Interaction;
  readonly nextIdSequence: number;
};

const idle: Interaction = { kind: "idle" };

export const gridSize = 10;

// How far, in screen pixels, the pointer must travel before a press on a Shape becomes a drag,
// so a click never snaps a Shape that is off the grid.
const dragThreshold = 3;

export const minimumShapeSize = 10;

// How far, in screen pixels, from a resize handle's centre a press still grabs it.
const handleReach = 6;

const snapToGrid = (value: number): number => Math.round(value / gridSize) * gridSize;

const snapsToGrid = (input: PointerInput): boolean => !input.modifiers.alt;

export const createEditor = (deps: Dependencies): EditorState => ({
  deps,
  sketch: { shapes: {} },
  tool: "select",
  selection: [],
  interaction: idle,
  nextIdSequence: 1,
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

const startSelectingBox = (state: EditorState, input: PointerInput): EditorState => {
  const additive = input.modifiers.shift;
  return {
    ...state,
    selection: additive ? state.selection : [],
    interaction: {
      kind: "selectingBox",
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

const handleAt = (state: EditorState, point: Point): { shape: SymbolShape; handle: Handle } | undefined => {
  const shape = resizableShape(state);
  const grabbed = shape
    ? handlePositions(shape.bounds).find(
        ({ position }) => Math.abs(position.x - point.x) <= handleReach && Math.abs(position.y - point.y) <= handleReach,
      )
    : undefined;
  return shape && grabbed ? { shape, handle: grabbed.handle } : undefined;
};

const pressWithSelectTool = (state: EditorState, input: PointerInput): EditorState => {
  const grabbed = handleAt(state, input.position);
  if (grabbed) {
    return {
      ...state,
      interaction: {
        kind: "resizing",
        shapeId: grabbed.shape.id,
        handle: grabbed.handle,
        origin: input.position,
        before: state.sketch,
      },
    };
  }
  const hit = shapeAt(state.sketch, input.position);
  if (!hit) return startSelectingBox(state, input);
  const selection = input.modifiers.shift
    ? toggle(state.selection, hit.id)
    : state.selection.includes(hit.id)
      ? state.selection
      : [hit.id];
  return selection.includes(hit.id)
    ? { ...state, selection, interaction: { kind: "moving", origin: input.position, before: state.sketch } }
    : { ...state, selection };
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

// Zero until the pointer has travelled past the drag threshold.
const pointerOffset = (origin: Point, input: PointerInput): Point => {
  const offset = { x: input.position.x - origin.x, y: input.position.y - origin.y };
  return Math.hypot(offset.x, offset.y) < dragThreshold ? { x: 0, y: 0 } : offset;
};

const isZero = (offset: Point): boolean => offset.x === 0 && offset.y === 0;

// The selection moves as one block: its top-left corner snaps to the grid, so the Shapes keep their distances.
const dragOffset = (state: EditorState, origin: Point, before: Sketch, input: PointerInput): Point => {
  const offset = pointerOffset(origin, input);
  if (isZero(offset) || !snapsToGrid(input)) return offset;
  const block = enclosingBounds(state.selection.flatMap((id) => before.shapes[id]?.bounds ?? []));
  return {
    x: snapToGrid(block.x + offset.x) - block.x,
    y: snapToGrid(block.y + offset.y) - block.y,
  };
};

const resizeShape = (state: EditorState, interaction: Extract<Interaction, { kind: "resizing" }>, input: PointerInput) => {
  const { before, shapeId, handle, origin } = interaction;
  const shape = before.shapes[shapeId];
  const offset = pointerOffset(origin, input);
  if (!shape || isZero(offset)) return { ...state, sketch: before };
  const bounds = resizeBounds(shape.bounds, handle, offset, {
    snap: snapsToGrid(input) ? snapToGrid : (value) => value,
    keepAspectRatio: input.modifiers.shift,
    minimumSize: minimumShapeSize,
  });
  return { ...state, sketch: { ...before, shapes: { ...before.shapes, [shapeId]: { ...shape, bounds } } } };
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
        },
      };

const pointerMove = (state: EditorState, input: PointerInput): EditorState => {
  const { interaction } = state;
  switch (interaction.kind) {
    case "idle":
      return state;
    case "creatingShape":
      return { ...state, interaction: { ...interaction, current: input.position } };
    case "selectingBox": {
      const inside = shapesInside(state.sketch, boundsBetween(interaction.origin, input.position));
      return {
        ...state,
        selection: interaction.additive ? union(interaction.previousSelection, inside) : inside,
        interaction: { ...interaction, current: input.position },
      };
    }
    case "moving": {
      const offset = dragOffset(state, interaction.origin, interaction.before, input);
      return { ...state, sketch: moveShapes(interaction.before, state.selection, offset) };
    }
    case "resizing":
      return resizeShape(state, interaction, input);
  }
};

const addShape = (sketch: Sketch, shape: SymbolShape): Sketch => ({
  ...sketch,
  shapes: { ...sketch.shapes, [shape.id]: shape },
});

const createShape = (state: EditorState, symbol: SymbolId, bounds: Bounds): EditorState => {
  const shape: SymbolShape = { id: state.deps.generateId(state.nextIdSequence), symbol, bounds };
  return { ...state, sketch: addShape(state.sketch, shape), nextIdSequence: state.nextIdSequence + 1 };
};

const pointerUp = (state: EditorState, input: PointerInput): EditorState => {
  const moved = pointerMove(state, input);
  const { interaction } = moved;
  const finished: EditorState = { ...moved, interaction: idle };
  switch (interaction.kind) {
    case "creatingShape":
      return createShape(finished, interaction.symbol, boundsBetween(interaction.origin, interaction.current));
    case "idle":
    case "selectingBox":
    case "moving":
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
    case "selectingBox":
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

// Nudges move by exact steps and are not snapped, so a Shape can be placed between grid lines.
const nudge = (state: EditorState, direction: Point, shift: boolean): EditorState => {
  const step = shift ? gridSize : 1;
  return {
    ...state,
    sketch: moveShapes(state.sketch, state.selection, { x: direction.x * step, y: direction.y * step }),
  };
};

const deleteSelection = (state: EditorState): EditorState => ({
  ...state,
  sketch: {
    ...state.sketch,
    shapes: Object.fromEntries(Object.entries(state.sketch.shapes).filter(([id]) => !state.selection.includes(id))),
  },
  selection: [],
});

const keyDown = (state: EditorState, input: KeyInput): EditorState => {
  if (input.key === "Escape") {
    return state.interaction.kind === "idle" ? { ...state, selection: [] } : cancelGesture(state);
  }
  if (state.interaction.kind !== "idle") return state;
  const command = input.modifiers.meta || input.modifiers.ctrl;
  if (command && input.key.toLowerCase() === "a") {
    return { ...state, selection: Object.keys(state.sketch.shapes) };
  }
  if (input.key === "Delete" || input.key === "Backspace") return deleteSelection(state);
  const direction = nudgeDirections[input.key];
  if (direction) return nudge(state, direction, input.modifiers.shift);
  return state;
};

export const update = (state: EditorState, input: Input): EditorState => {
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
      return state;
  }
};
