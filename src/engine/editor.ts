import {
  boundsBetween,
  boundsOfSpans,
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
import { displayedBounds } from "./label";
import { hitsOutline } from "./shape-geometry";
import { symbolDefinition, type SymbolId } from "./symbols";
import type { LabelAlignment } from "./symbols/symbol";
import { toolOfShortcut, type Tool } from "./tools";
import * as viewport from "./viewport";

export type Modifiers = {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
};

export const noModifiers: Modifiers = { shift: false, alt: false, ctrl: false, meta: false };

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

/** A scroll of `delta` screen pixels, from a mouse wheel or a two-finger trackpad swipe. */
export type WheelInput = {
  readonly type: "wheel";
  readonly position: Point;
  readonly delta: Point;
  readonly modifiers: Modifiers;
};

export type Input =
  | { readonly type: "selectTool"; readonly tool: Tool }
  | PointerInput
  | KeyInput
  | WheelInput
  | { readonly type: "pinch"; readonly position: Point; readonly scale: number }
  // Reported after the two clicks it is made of, at their screen position.
  | { readonly type: "doubleClick"; readonly position: Point }
  | { readonly type: "zoomToFit" | "resetZoom"; readonly screenSize: viewport.Size }
  | { readonly type: "undo" | "redo" }
  // The whole text of the Label being edited, after each change made in its text field.
  | { readonly type: "changeLabelText"; readonly text: string }
  | { readonly type: "commitLabel" | "cancelLabel" }
  // Change the selected Shapes.
  | { readonly type: "changeStyle"; readonly style: Partial<Style> }
  | { readonly type: "changeLabelAlignment"; readonly alignment: LabelAlignment };

export type TextMeasurer = (text: string, fontSize: number) => number;

export type ShapeId = string;

/** Turns the editor's running sequence number into a Shape ID. Must give a different ID for every number. */
export type IdGenerator = (sequence: number) => ShapeId;

export type Dependencies = {
  readonly measureText: TextMeasurer;
  readonly generateId: IdGenerator;
};

/** The three font sizes a Label can have. */
export type FontSize = "small" | "medium" | "large";

export type Style = { readonly fontSize: FontSize };

const defaultStyle: Style = { fontSize: "medium" };

export type Label = { readonly text: string; readonly alignment: LabelAlignment };

/**
 * A new Shape of `symbol` filling `bounds`, but for its ID: with an empty Label, aligned as the Symbol's Labels are by
 * default, and the default style.
 */
export function newShape(symbol: SymbolId, bounds: Bounds): ShapeWithoutId {
  return {
    symbol,
    bounds,
    label: { text: "", alignment: symbolDefinition(symbol).defaultLabelAlignment },
    style: defaultStyle,
  };
}

/** A Shape but for its ID, such as one still being drawn. */
export type ShapeWithoutId = Omit<SymbolShape, "id">;

export type SymbolShape = {
  readonly id: ShapeId;
  readonly symbol: SymbolId;
  // As the user set it. The Shape is shown taller when its Label needs more room.
  readonly bounds: Bounds;
  readonly label: Label;
  readonly style: Style;
};

export type Sketch = {
  readonly shapes: Readonly<Record<ShapeId, SymbolShape>>;
};

// A press that may become a drag: where it started and where the pointer is now. `dragged` is set once the pointer
// first travels past the drag threshold, and stays set even if the pointer comes back.
type Press = { readonly origin: Point; readonly current: Point; readonly dragged: boolean };

// A drag that changes the Sketch, and the Sketch at its start. Each pointer move is applied to that Sketch afresh, and
// cancelling restores it.
type Drag = Press & { readonly before: Sketch };

type Creation = { readonly kind: "creatingShape"; readonly symbol: SymbolId; readonly snaps: boolean } & Press;

type Interaction =
  | { readonly kind: "idle" }
  | Creation
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
  | ({ readonly kind: "resizing"; readonly shapeId: ShapeId; readonly handle: ResizeHandle } & Drag)
  // The viewport follows the pointer so that the Sketch point it grabbed stays under it.
  | { readonly kind: "panning"; readonly grabbed: Point }
  // The text the Label had before, which cancelling puts back.
  | { readonly kind: "editingLabel"; readonly shapeId: ShapeId; readonly originalText: string };

export type EditorState = {
  readonly deps: Dependencies;
  readonly sketch: Sketch;
  readonly tool: Tool;
  readonly selection: readonly ShapeId[];
  readonly interaction: Interaction;
  readonly viewport: viewport.Viewport;
  // While space is held, a press pans instead of using the active tool.
  readonly spaceHeld: boolean;
  readonly nextIdSequence: number;
  // Earlier and undone Sketches. Only changes to the Sketch are recorded, one step per finished gesture or command.
  readonly history: history.History<Sketch>;
};

const idle: Interaction = { kind: "idle" };

function isIdle(state: EditorState): boolean {
  return state.interaction.kind === "idle";
}

// How far, in screen pixels, the pointer must travel before a press on a Shape or a resize handle becomes a drag,
// so a click never nudges or snaps a Shape by accident.
const dragThreshold = 3;

const minimumShapeSize = 10;

// The Bounds of a Shape drawn by dragging from `origin` to `current`, never smaller than the minimum size. When
// snapping, both corners snap to the grid, but the Shape still grows the way the pointer went from where it started.
function drawnBounds(origin: Point, current: Point, snap: (value: number) => number): Bounds {
  const span = (from: number, to: number): Span =>
    spanAtLeast(snap(from), snap(to), sideOf(from, to, 1), minimumShapeSize);
  return boundsOfSpans(span(origin.x, current.x), span(origin.y, current.y));
}

// A click gives the Symbol's default size, centred on the click. When snapping, both corners snap to the grid, as for
// a drawn Shape.
function clickedBounds(symbol: SymbolId, at: Point, snap: (value: number) => number): Bounds {
  const { width, height } = symbolDefinition(symbol).defaultSize;
  const span = (middle: number, size: number): Span =>
    spanAtLeast(snap(middle - size / 2), snap(middle + size / 2), 1, minimumShapeSize);
  return boundsOfSpans(span(at.x, width), span(at.y, height));
}

/** The Bounds of the Shape that releasing the pointer now would create. */
export function creationBounds({ symbol, origin, current, dragged, snaps }: Creation): Bounds {
  return dragged ? drawnBounds(origin, current, snapperFor(snaps)) : clickedBounds(symbol, origin, snapperFor(snaps));
}

// How far, in screen pixels, from a resize handle's centre a press still grabs it.
const handleReach = 6;

// Snapping to the grid is off by default. Holding Alt turns it on, for drags, resizes and arrow keys alike.
function snapsToGrid(modifiers: Modifiers): boolean {
  return modifiers.alt;
}

function snapperFor(snaps: boolean): ((value: number) => number) {
  return (snaps ? snapToGrid : (value) => value);
}

export const emptySketch: Sketch = { shapes: {} };

// Sketches saved before Shapes had Labels and a style have Shapes without them, which get an empty Label and the
// default style.
function withLabels(sketch: Sketch): Sketch {
  const complete = (shape: Partial<SymbolShape> & Pick<SymbolShape, "id" | "symbol" | "bounds">): SymbolShape => ({
    ...newShape(shape.symbol, shape.bounds),
    ...shape,
  });
  return {
    ...sketch,
    shapes: Object.fromEntries(Object.entries(sketch.shapes).map(([id, shape]) => [id, complete(shape)])),
  };
}

/**
 * A fresh editor on the `saved` Sketch, a new empty one by default. Nothing is selected and there is nothing to undo.
 */
export function createEditor(deps: Dependencies, saved: Sketch = emptySketch): EditorState {
  const sketch = withLabels(saved);
  return {
    deps,
    sketch,
    tool: "select",
    selection: [],
    interaction: idle,
    viewport: viewport.initialViewport,
    spaceHeld: false,
    nextIdSequence: 1,
    history: history.startHistory(sketch),
  };
}

// What the user sees and points at is the Shape as displayed, grown to fit its Label.
function displayed(state: EditorState, shape: SymbolShape): Bounds {
  return displayedBounds(shape, state.deps.measureText);
}

// Shapes are hit-tested by their Symbol's outline, as if filled, even with a transparent fill. The topmost Shape wins.
function shapeAt(state: EditorState, point: Point): SymbolShape | undefined {
  return Object.values(state.sketch.shapes).findLast((shape) =>
    hitsOutline(shape.symbol, displayed(state, shape), point),
  );
}

function shapesInside(state: EditorState, box: Bounds): readonly ShapeId[] {
  return Object.values(state.sketch.shapes)
    .filter((shape) => containsBounds(box, displayed(state, shape)))
    .map(({ id }) => id);
}

function union(a: readonly ShapeId[], b: readonly ShapeId[]): readonly ShapeId[] {
  return [
    ...a,
    ...b.filter((id) => !a.includes(id)),
  ];
}

function toggle(ids: readonly ShapeId[], id: ShapeId): readonly ShapeId[] {
  return ids.includes(id) ? ids.filter((other) => other !== id) : [...ids, id];
}

function startMarquee(state: EditorState, input: PointerInput): EditorState {
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
}

/** The one selected Shape, which is the only time resize handles are shown. */
export function resizableShape(state: EditorState): SymbolShape | undefined {
  const [id, ...others] = state.selection;
  return id !== undefined && others.length === 0 ? state.sketch.shapes[id] : undefined;
}

// A distance in screen pixels, such as the drag threshold, as a distance on the Sketch at the current zoom.
function sketchDistance(state: EditorState, screenDistance: number): number {
  return screenDistance / state.viewport.zoom;
}

function handleAt(state: EditorState, point: Point): { shape: SymbolShape; handle: ResizeHandle } | undefined {
  const shape = resizableShape(state);
  const reach = sketchDistance(state, handleReach);
  const nearby = shape
    ? handlePositions(displayed(state, shape)).find(
        ({ position }) => Math.abs(position.x - point.x) <= reach && Math.abs(position.y - point.y) <= reach,
      )
    : undefined;
  return shape && nearby ? { shape, handle: nearby.handle } : undefined;
}

function pressWithSelectTool(state: EditorState, input: PointerInput): EditorState {
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
  const hit = shapeAt(state, input.position);
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
}

function moveShapes(sketch: Sketch, ids: readonly ShapeId[], offset: Point): Sketch {
  return {
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
  };
}

// The Bounds around the selection, which moves as one block.
function selectionBlock(sketch: Sketch, selection: readonly ShapeId[]): Bounds {
  return enclosingBounds(selection.flatMap((id) => sketch.shapes[id]?.bounds ?? []));
}

// Where the pointer is and which modifiers are held: all a drag needs, whether from a pointer move or a key press.
type PointerState = Pick<PointerInput, "position" | "modifiers">;

// The press with the pointer at `pointer`, noting whether it has now travelled past the drag threshold.
function continuePress<P extends Press>(state: EditorState, press: P, pointer: PointerState): P {
  const travelled = Math.hypot(pointer.position.x - press.origin.x, pointer.position.y - press.origin.y);
  return {
    ...press,
    current: pointer.position,
    dragged: press.dragged || travelled >= sketchDistance(state, dragThreshold),
  };
}

// Zero until the pointer has travelled past the drag threshold.
function pointerOffset(drag: Drag, pointer: PointerState): Point {
  return drag.dragged
    ? { x: pointer.position.x - drag.origin.x, y: pointer.position.y - drag.origin.y }
    : { x: 0, y: 0 };
}

// The block's top-left corner snaps to the grid, so the Shapes keep their distances.
function dragOffset(state: EditorState, drag: Drag, pointer: PointerState): Point {
  const offset = pointerOffset(drag, pointer);
  if (!drag.dragged || !snapsToGrid(pointer.modifiers)) return offset;
  const block = selectionBlock(drag.before, state.selection);
  return {
    x: snapToGrid(block.x + offset.x) - block.x,
    y: snapToGrid(block.y + offset.y) - block.y,
  };
}

// The Shape's own Bounds after a resize from `from`, its Bounds as displayed, to `resized`. They follow the resize, but
// the Shape's Label still decides how tall it is shown:
// - A resize that leaves the top and bottom where they were keeps the Shape's own height, so it still shrinks back
//   when its Label does.
// - So does one that leaves the Shape shorter than its Label needs, unless it went below its own height. The Shape is
//   then shown as tall as its Label needs, down from its top, or up from its bottom when the edge that stayed put is
//   at the bottom, such as when the top was dragged, or the bottom was flipped past the top.
function resizedOwnBounds(state: EditorState, shape: SymbolShape, from: Bounds, resized: Bounds): Bounds {
  if (resized.y === from.y && resized.height === from.height) {
    return { ...resized, y: shape.bounds.y, height: shape.bounds.height };
  }
  const shown = displayed(state, { ...shape, bounds: resized });
  if (shown.height <= resized.height) return resized;
  const own = { ...resized, height: Math.min(resized.height, shape.bounds.height) };
  const bottom = resized.y + resized.height;
  const stayedAtBottom = bottom === from.y + from.height || bottom === from.y;
  return stayedAtBottom ? { ...own, y: bottom - shown.height } : own;
}

function resizeShape(
  state: EditorState,
  interaction: Extract<Interaction, { kind: "resizing" }>,
  pointer: PointerState,
): EditorState {
  const { before, shapeId, handle } = interaction;
  const shape = before.shapes[shapeId];
  if (!shape || !interaction.dragged) return { ...state, sketch: before, interaction };
  // The resize starts from the Shape as displayed, so its handles move the edges the user sees.
  const from = displayed(state, shape);
  const resized = resizeBounds(from, handle, pointerOffset(interaction, pointer), {
    snap: snapperFor(snapsToGrid(pointer.modifiers)),
    keepAspectRatio: pointer.modifiers.shift,
    minimumSize: minimumShapeSize,
  });
  const bounds = resizedOwnBounds(state, shape, from, resized);
  return {
    ...state,
    sketch: { ...before, shapes: { ...before.shapes, [shapeId]: { ...shape, bounds } } },
    interaction,
  };
}

function dragTo(
  state: EditorState,
  interaction: Extract<Interaction, { kind: "moving" | "resizing" }>,
  pointer: PointerState,
): EditorState {
  switch (interaction.kind) {
    case "moving": {
      const drag = continuePress(state, interaction, pointer);
      return {
        ...state,
        sketch: moveShapes(drag.before, state.selection, dragOffset(state, drag, pointer)),
        interaction: drag,
      };
    }
    case "resizing":
      return resizeShape(state, continuePress(state, interaction, pointer), pointer);
  }
}

/** Whether a press on the Sketch pans instead of using the active tool: with the pan tool, or while space is held. */
export function pansOnPress(state: EditorState): boolean {
  return state.tool === "pan" || state.spaceHeld;
}

// A press outside the Label's text field finishes editing it, and then does what it would have done anyway.
function pointerDown(state: EditorState, input: PointerInput): EditorState {
  if (state.interaction.kind === "editingLabel") return pointerDown(finishEditingLabel(state, "commit"), input);
  if (pansOnPress(state)) return { ...state, interaction: { kind: "panning", grabbed: input.position } };
  switch (state.tool) {
    case "select":
      return pressWithSelectTool(state, input);
    case "pan":
      // Already panning, as pansOnPress covers the pan tool.
      return state;
    default:
      return {
        ...state,
        interaction: {
          kind: "creatingShape",
          symbol: state.tool,
          origin: input.position,
          current: input.position,
          dragged: false,
          snaps: snapsToGrid(input.modifiers),
        },
      };
  }
}

function pointerMove(state: EditorState, input: PointerInput): EditorState {
  const { interaction } = state;
  switch (interaction.kind) {
    case "idle":
    case "editingLabel":
      return state;
    case "creatingShape":
      return {
        ...state,
        interaction: { ...continuePress(state, interaction, input), snaps: snapsToGrid(input.modifiers) },
      };
    case "marqueeSelecting": {
      const inside = shapesInside(state, boundsBetween(interaction.origin, input.position));
      return {
        ...state,
        selection: interaction.additive ? union(interaction.previousSelection, inside) : inside,
        interaction: { ...interaction, current: input.position },
      };
    }
    case "moving":
    case "resizing":
      return dragTo(state, interaction, input);
    case "panning":
      return { ...state, viewport: viewport.keepUnderPointer(state.viewport, interaction.grabbed, input.position) };
  }
}

function updateShape(sketch: Sketch, id: ShapeId, change: (shape: SymbolShape) => SymbolShape): Sketch {
  const shape = sketch.shapes[id];
  return shape ? { ...sketch, shapes: { ...sketch.shapes, [id]: change(shape) } } : sketch;
}

function withLabelText(sketch: Sketch, id: ShapeId, text: string): Sketch {
  return updateShape(sketch, id, (shape) => ({ ...shape, label: { ...shape.label, text } }));
}

// Only one Shape is selected while its Label is being edited.
function startEditingLabel(state: EditorState, shapeId: ShapeId | undefined): EditorState {
  const shape = shapeId === undefined ? undefined : state.sketch.shapes[shapeId];
  return shape
    ? {
        ...state,
        selection: [shape.id],
        interaction: { kind: "editingLabel", shapeId: shape.id, originalText: shape.label.text },
      }
    : state;
}

// Double-clicking a Shape with the select tool opens its Label.
function doubleClick(state: EditorState, at: Point): EditorState {
  if (!isIdle(state) || state.tool !== "select" || state.spaceHeld) return state;
  return startEditingLabel(state, shapeAt(state, at)?.id);
}

function changeLabelText(state: EditorState, text: string): EditorState {
  const { interaction } = state;
  return interaction.kind === "editingLabel"
    ? { ...state, sketch: withLabelText(state.sketch, interaction.shapeId, text) }
    : state;
}

// Changes every selected Shape. This works while a Label is being edited too, and is then part of its editing
// session, but not in the middle of a gesture, which would undo it on the next pointer move.
function changeSelected(state: EditorState, change: (shape: SymbolShape) => SymbolShape): EditorState {
  if (!isIdle(state) && state.interaction.kind !== "editingLabel") return state;
  return { ...state, sketch: state.selection.reduce((sketch, id) => updateShape(sketch, id, change), state.sketch) };
}

// Removes a Shape that is nothing but its Label once that Label is left empty, as nothing of it would show. Text that
// is only spaces and line breaks counts as empty.
function removeIfEmpty(state: EditorState, id: ShapeId): EditorState {
  const shape = state.sketch.shapes[id];
  return shape && symbolDefinition(shape.symbol).labelOnly && shape.label.text.trim() === ""
    ? removeShapes(state, [id])
    : state;
}

// Committing keeps the text as edited. Cancelling puts back the text from before. A Shape just created and removed
// again for its empty Label leaves the Sketch as it was, so it adds no undo step.
function finishEditingLabel(state: EditorState, how: "commit" | "cancel"): EditorState {
  const { interaction } = state;
  if (interaction.kind !== "editingLabel") return state;
  const sketch =
    how === "commit" ? state.sketch : withLabelText(state.sketch, interaction.shapeId, interaction.originalText);
  return removeIfEmpty({ ...state, sketch, interaction: idle }, interaction.shapeId);
}

function addShape(sketch: Sketch, shape: SymbolShape): Sketch {
  return {
    ...sketch,
    shapes: { ...sketch.shapes, [shape.id]: shape },
  };
}

// The first sequence number, from `sequence` on, whose ID is not taken yet. A loaded Sketch can already hold IDs that
// the generator gives again, such as when a Sketch is closed and opened again, which starts the sequence afresh.
function freeIdSequence(state: EditorState, sequence: number): number {
  return state.sketch.shapes[state.deps.generateId(sequence)] === undefined
    ? sequence
    : freeIdSequence(state, sequence + 1);
}

// A new Shape becomes the selection, so it can be adjusted straight away, and its Label opens for editing.
function createShape(state: EditorState, symbol: SymbolId, bounds: Bounds): EditorState {
  const sequence = freeIdSequence(state, state.nextIdSequence);
  const shape: SymbolShape = { id: state.deps.generateId(sequence), ...newShape(symbol, bounds) };
  return {
    ...state,
    sketch: addShape(state.sketch, shape),
    selection: [shape.id],
    nextIdSequence: sequence + 1,
  };
}

function pointerUp(state: EditorState, input: PointerInput): EditorState {
  const moved = pointerMove(state, input);
  const { interaction } = moved;
  const finished: EditorState = { ...moved, interaction: idle };
  switch (interaction.kind) {
    case "creatingShape": {
      const created = createShape(finished, interaction.symbol, creationBounds(interaction));
      return { ...startEditingLabel(created, created.selection[0]), tool: "select" };
    }
    case "moving": {
      const clicked = interaction.dragged ? undefined : interaction.selectsOnClick;
      return clicked === undefined ? finished : { ...finished, selection: [clicked] };
    }
    case "idle":
    case "marqueeSelecting":
    case "resizing":
    case "panning":
      return finished;
    case "editingLabel":
      return moved;
  }
}

function cancelGesture(state: EditorState): EditorState {
  const { interaction } = state;
  const cancelled: EditorState = { ...state, interaction: idle };
  switch (interaction.kind) {
    case "idle":
    case "creatingShape":
    case "panning":
      return cancelled;
    // Editing a Label is not a pointer gesture, so a lost pointer leaves it open.
    case "editingLabel":
      return state;
    case "marqueeSelecting":
      return { ...cancelled, selection: interaction.previousSelection };
    case "moving":
    case "resizing":
      return { ...cancelled, sketch: interaction.before };
  }
}

const nudgeDirections: Readonly<Record<string, Point>> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

// A nudge moves by one unit, or by one grid step with shift. With snapping on, it moves the selection's top-left
// corner to the next grid line instead.
function nudgeOffset(state: EditorState, direction: Point, modifiers: Modifiers): Point {
  if (!snapsToGrid(modifiers)) {
    const step = modifiers.shift ? gridSize : 1;
    return { x: direction.x * step, y: direction.y * step };
  }
  const block = selectionBlock(state.sketch, state.selection);
  return {
    x: direction.x === 0 ? 0 : nextGridLine(block.x, direction.x) - block.x,
    y: direction.y === 0 ? 0 : nextGridLine(block.y, direction.y) - block.y,
  };
}

function nudge(state: EditorState, direction: Point, modifiers: Modifiers): EditorState {
  return state.selection.length === 0
    ? state
    : { ...state, sketch: moveShapes(state.sketch, state.selection, nudgeOffset(state, direction, modifiers)) };
}

function removeShapes(state: EditorState, ids: readonly ShapeId[]): EditorState {
  return {
    ...state,
    sketch: {
      ...state.sketch,
      shapes: Object.fromEntries(Object.entries(state.sketch.shapes).filter(([id]) => !ids.includes(id))),
    },
    selection: state.selection.filter((id) => !ids.includes(id)),
  };
}

function deleteSelection(state: EditorState): EditorState {
  return removeShapes(state, state.selection);
}

// Pressing or releasing a modifier mid-drag, such as Alt for snapping, applies to the drag straight away,
// without waiting for the pointer to move.
function updateDragModifiers(state: EditorState, modifiers: Modifiers): EditorState {
  const { interaction } = state;
  switch (interaction.kind) {
    case "creatingShape":
      return { ...state, interaction: { ...interaction, snaps: snapsToGrid(modifiers) } };
    case "moving":
    case "resizing":
      return dragTo(state, interaction, { position: interaction.current, modifiers });
    case "idle":
    case "marqueeSelecting":
    case "panning":
    case "editingLabel":
      return state;
  }
}

// Space is tracked on its own, whatever else is going on, as a press while it is held pans.
function trackSpace(state: EditorState, input: KeyInput): EditorState {
  return input.key === " " ? { ...state, spaceHeld: input.type === "keyDown" } : state;
}

// Escape and Enter finish editing a Label, keeping the text. Other keys while editing are typing, such as shift+Enter
// for a line break, which the Label's text field takes care of.
function keyWhileEditingLabel(state: EditorState, input: KeyInput): EditorState {
  const finishes = input.key === "Escape" || (input.key === "Enter" && !input.modifiers.shift);
  return finishes ? finishEditingLabel(state, "commit") : state;
}

function keyDown(state: EditorState, input: KeyInput): EditorState {
  if (state.interaction.kind === "editingLabel") return keyWhileEditingLabel(state, input);
  if (input.key === "Escape") {
    return isIdle(state) ? { ...state, selection: [] } : cancelGesture(state);
  }
  if (!isIdle(state)) return updateDragModifiers(state, input.modifiers);
  const command = input.modifiers.meta || input.modifiers.ctrl;
  if (command && input.key.toLowerCase() === "a") {
    return { ...state, selection: Object.keys(state.sketch.shapes) };
  }
  if (command && input.key.toLowerCase() === "z") return input.modifiers.shift ? redo(state) : undo(state);
  if (input.key === "Delete" || input.key === "Backspace") return deleteSelection(state);
  if (input.key === "Enter") return startEditingLabel(state, resizableShape(state)?.id);
  const direction = nudgeDirections[input.key];
  if (direction) return nudge(state, direction, input.modifiers);
  const tool = command || input.modifiers.alt ? undefined : toolOfShortcut(input.key);
  if (tool) return { ...state, tool };
  return state;
}

// Puts back the Sketch the history now holds. Shapes that no longer exist drop out of the selection.
function restore(state: EditorState, restored: history.History<Sketch>): EditorState {
  return {
    ...state,
    sketch: restored.present,
    selection: state.selection.filter((id) => restored.present.shapes[id] !== undefined),
    history: restored,
  };
}

function undo(state: EditorState): EditorState {
  return restore(state, history.undo(state.history));
}

function redo(state: EditorState): EditorState {
  return restore(state, history.redo(state.history));
}

// Scrolling 100 pixels zooms by 2×. A mouse wheel scrolls about 100 pixels a notch, which would zoom too far at a
// time, so a single scroll counts for at most half that. A trackpad scrolls a few pixels at a time.
function zoomFactorOfScroll(deltaY: number): number {
  return 2 ** (-Math.max(-50, Math.min(50, deltaY)) / 100);
}

function wheel(state: EditorState, input: WheelInput): EditorState {
  return input.modifiers.ctrl || input.modifiers.meta
    ? { ...state, viewport: viewport.zoomAround(state.viewport, input.position, zoomFactorOfScroll(input.delta.y)) }
    : { ...state, viewport: viewport.panBy(state.viewport, input.delta) };
}

/** The smallest Bounds around everything on the Sketch as displayed, or `undefined` when it is empty. */
export function contentBounds(sketch: Sketch, measure: TextMeasurer): Bounds | undefined {
  const all = Object.values(sketch.shapes).map((shape) => displayedBounds(shape, measure));
  return all.length === 0 ? undefined : enclosingBounds(all);
}

// An empty Sketch has nothing to frame, so it goes back to 100% instead.
function zoomToFit(state: EditorState, screenSize: viewport.Size): viewport.Viewport {
  const content = contentBounds(state.sketch, state.deps.measureText);
  return content ? viewport.fit(screenSize, content) : viewport.resetZoom(state.viewport, screenSize);
}

// Pointer positions arrive in screen pixels. Gestures on the Sketch work in Sketch coordinates.
function inSketch(state: EditorState, input: PointerInput): PointerInput {
  return {
    ...input,
    position: viewport.toSketch(state.viewport, input.position),
  };
}

function applyInput(state: EditorState, input: Input): EditorState {
  switch (input.type) {
    case "selectTool":
      return { ...state, tool: input.tool };
    case "pointerDown":
      return pointerDown(state, inSketch(state, input));
    case "pointerMove":
      return pointerMove(state, inSketch(state, input));
    case "pointerUp":
      return pointerUp(state, inSketch(state, input));
    case "pointerCancel":
      return cancelGesture(state);
    case "doubleClick":
      return doubleClick(state, viewport.toSketch(state.viewport, input.position));
    case "keyDown":
      return keyDown(trackSpace(state, input), input);
    case "keyUp":
      return updateDragModifiers(trackSpace(state, input), input.modifiers);
    case "wheel":
      return wheel(state, input);
    case "pinch":
      return { ...state, viewport: viewport.zoomAround(state.viewport, input.position, input.scale) };
    case "zoomToFit":
      return { ...state, viewport: zoomToFit(state, input.screenSize) };
    case "resetZoom":
      return { ...state, viewport: viewport.resetZoom(state.viewport, input.screenSize) };
    case "undo":
      return isIdle(state) ? undo(state) : state;
    case "redo":
      return isIdle(state) ? redo(state) : state;
    case "changeLabelText":
      return changeLabelText(state, input.text);
    case "commitLabel":
      return finishEditingLabel(state, "commit");
    case "cancelLabel":
      return finishEditingLabel(state, "cancel");
    case "changeStyle":
      return changeSelected(state, (shape) => ({ ...shape, style: { ...shape.style, ...input.style } }));
    case "changeLabelAlignment":
      return changeSelected(state, (shape) => ({ ...shape, label: { ...shape.label, alignment: input.alignment } }));
  }
}

// A change to the Sketch is recorded once the editor is idle again, so a whole gesture, or any longer interaction,
// is one step, and a cancelled one, which puts the Sketch back, records nothing.
export function update(state: EditorState, input: Input): EditorState {
  const next = applyInput(state, input);
  return isIdle(next) ? { ...next, history: history.record(next.history, next.sketch) } : next;
}
