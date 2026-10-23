import { boundsBetween, contains, containsBounds, enclosingBounds, translate, type Bounds, type Point } from "./geometry";
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

// Where a drag on the Sketch started, and the Sketch at that moment. Each pointer move is applied to that Sketch
// afresh, and cancelling restores it.
type DragStart = { readonly origin: Point; readonly before: Sketch };

type Interaction =
  | { readonly kind: "idle" }
  | {
      readonly kind: "creatingShape";
      readonly symbol: SymbolId;
      readonly origin: Point;
      readonly current: Point;
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
    } & DragStart)
  | ({ readonly kind: "resizing"; readonly shapeId: ShapeId; readonly handle: ResizeHandle } & DragStart);

export type EditorState = {
  readonly deps: Dependencies;
  readonly sketch: Sketch;
  readonly tool: Tool;
  readonly selection: readonly ShapeId[];
  readonly interaction: Interaction;
  readonly nextIdSequence: number;
};

const idle: Interaction = { kind: "idle" };

const gridSize = 10;

// How far, in screen pixels, the pointer must travel before a press on a Shape or a resize handle becomes a drag,
// so a click never snaps a Shape that is off the grid.
const dragThreshold = 3;

const minimumShapeSize = 10;

// How far, in screen pixels, from a resize handle's centre a press still grabs it.
const handleReach = 6;

const snapToGrid = (value: number): number => Math.round(value / gridSize) * gridSize;

const snapsToGrid = (modifiers: Modifiers): boolean => !modifiers.alt;

// The next grid line from `value` in `direction` (-1 or 1), skipping the line `value` is on.
const nextGridLine = (value: number, direction: number): number =>
  direction > 0 ? Math.floor(value / gridSize) * gridSize + gridSize : Math.ceil(value / gridSize) * gridSize - gridSize;

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
        before: state.sketch,
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
      before: state.sketch,
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

// Zero until the pointer has travelled past the drag threshold.
const pointerOffset = (origin: Point, input: PointerInput): Point => {
  const offset = { x: input.position.x - origin.x, y: input.position.y - origin.y };
  return Math.hypot(offset.x, offset.y) < dragThreshold ? { x: 0, y: 0 } : offset;
};

const isZero = (offset: Point): boolean => offset.x === 0 && offset.y === 0;

// The block's top-left corner snaps to the grid, so the Shapes keep their distances.
const dragOffset = (state: EditorState, { origin, before }: DragStart, input: PointerInput): Point => {
  const offset = pointerOffset(origin, input);
  if (isZero(offset) || !snapsToGrid(input.modifiers)) return offset;
  const block = selectionBlock(before, state.selection);
  return {
    x: snapToGrid(block.x + offset.x) - block.x,
    y: snapToGrid(block.y + offset.y) - block.y,
  };
};

const resizeShape = (
  state: EditorState,
  interaction: Extract<Interaction, { kind: "resizing" }>,
  input: PointerInput,
): EditorState => {
  const { before, shapeId, handle, origin } = interaction;
  const shape = before.shapes[shapeId];
  const offset = pointerOffset(origin, input);
  if (!shape || isZero(offset)) return { ...state, sketch: before };
  const bounds = resizeBounds(shape.bounds, handle, offset, {
    snap: snapsToGrid(input.modifiers) ? snapToGrid : (value) => value,
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
    case "marqueeSelecting": {
      const inside = shapesInside(state.sketch, boundsBetween(interaction.origin, input.position));
      return {
        ...state,
        selection: interaction.additive ? union(interaction.previousSelection, inside) : inside,
        interaction: { ...interaction, current: input.position },
      };
    }
    case "moving": {
      const offset = dragOffset(state, interaction, input);
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
    case "moving": {
      const clicked = isZero(pointerOffset(interaction.origin, input)) ? interaction.selectsOnClick : undefined;
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

// A plain nudge moves by one unit and is never snapped, so a Shape can be placed between grid lines. A shift
// nudge moves the selection's top-left corner to the next grid line, unless snapping is turned off.
const nudgeOffset = (state: EditorState, direction: Point, modifiers: Modifiers): Point => {
  if (!modifiers.shift) return direction;
  if (!snapsToGrid(modifiers)) return { x: direction.x * gridSize, y: direction.y * gridSize };
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
  if (direction) return nudge(state, direction, input.modifiers);
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
