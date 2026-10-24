import {
  arrowheads,
  boundTo,
  defaultArrowheads,
  endLetGoAt,
  labelPoint,
  layoutArrowLabel,
  newArrowLabel,
  resolveArrow,
  unbindFrom,
  withoutOffset,
  withoutStaleOffsets,
  type Arrow,
  type ArrowEnd,
  type Arrowhead,
  type Arrowheads,
  type ArrowWithoutId,
  type EndName,
  type ResolvedArrow,
  type Routing,
} from "./arrow";
import { offsetDraggedBy, type Axis } from "./elbow";
import {
  boundsBetween,
  boundsOfPoints,
  boundsOfSpans,
  contains,
  containsBounds,
  distance,
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
import { distanceToPolyline, shareAlongPolyline } from "./path";
import { hitsOutline } from "./shape-geometry";
import { isArrow, isSymbolShape } from "./shape-kind";
import { bringForward, bringToFront, restack, sendBackward, sendToBack, type Reorder } from "./stacking";
import { defaultStyle, validStyle, type Style } from "./style";
import { symbolDefinition, type SymbolId } from "./symbols";
import type { LabelAlignment } from "./symbols/symbol";
import { toolOfShortcut, type Tool } from "./tools";
import {
  childrenOf,
  drawOrder,
  innermostCommon,
  isWithin,
  onTopIn,
  outermost,
  withDescendants,
  type Placement,
} from "./tree";
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
  // The pointer left the Sketch, so nothing is hovered any more.
  | { readonly type: "pointerLeave" }
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
  // Either direction alone keeps each Shape's alignment in the other.
  | { readonly type: "changeLabelAlignment"; readonly alignment: Partial<LabelAlignment> }
  | { readonly type: "changeRouting"; readonly routing: Routing }
  | { readonly type: "changeArrowhead"; readonly end: EndName; readonly arrowhead: Arrowhead };

export type TextMeasurer = (text: string, fontSize: number) => number;

export type ShapeId = string;

/** Turns the editor's running sequence number into a Shape ID. Must give a different ID for every number. */
export type IdGenerator = (sequence: number) => ShapeId;

export type Dependencies = {
  readonly measureText: TextMeasurer;
  readonly generateId: IdGenerator;
};

export type Label = { readonly text: string; readonly alignment: LabelAlignment };

/**
 * A new Shape of `symbol` filling `bounds` in `style`, but for its ID: with an empty Label, aligned as the Symbol's
 * Labels are by default.
 */
export function newShape(symbol: SymbolId, bounds: Bounds, style: Style): ShapeWithoutId {
  return {
    symbol,
    bounds,
    label: { text: "", alignment: symbolDefinition(symbol).defaultLabelAlignment },
    style,
  };
}

/** A Shape but for its ID and its place among the other Shapes, such as one still being drawn. */
export type ShapeWithoutId = Omit<SymbolShape, "id" | keyof Placement>;

export type SymbolShape = {
  readonly id: ShapeId;
  // The Container the Shape is in, or `undefined` at the top level.
  readonly parent: ShapeId | undefined;
  // Its place among its siblings: it is drawn above those with a lower one.
  readonly z: number;
  readonly symbol: SymbolId;
  // As the user set it. The Shape is shown taller when its Label needs more room.
  readonly bounds: Bounds;
  readonly label: Label;
  readonly style: Style;
};

/** Every Shape is made from a Symbol, but for Arrows. */
export type Shape = SymbolShape | Arrow;

export type Sketch = {
  readonly shapes: Readonly<Record<ShapeId, Shape>>;
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
  // Pressed with the Arrow tool, where the new Arrow starts. It ends wherever the pointer is let go. `binds` is whether
  // that end binds to a Shape there, which holding Alt turns off.
  | ({ readonly kind: "drawingArrow"; readonly start: ArrowEnd; readonly binds: boolean } & Press)
  | ({
      readonly kind: "draggingArrowEnd";
      readonly arrowId: ShapeId;
      readonly end: EndName;
      readonly binds: boolean;
    } & Drag)
  // The middle segment of an elbow Arrow, dragged sideways.
  | ({ readonly kind: "draggingElbowSegment"; readonly arrowId: ShapeId } & Drag)
  // An Arrow's Label, dragged along its path.
  | ({ readonly kind: "draggingArrowLabel"; readonly arrowId: ShapeId } & Drag)
  // The viewport follows the pointer so that the Sketch point it grabbed stays under it.
  | { readonly kind: "panning"; readonly grabbed: Point }
  // The text the Label had before, which cancelling puts back.
  | { readonly kind: "editingLabel"; readonly shapeId: ShapeId; readonly originalText: string };

export type EditorState = {
  readonly deps: Dependencies;
  readonly sketch: Sketch;
  readonly tool: Tool;
  // The style most recently chosen, which new Shapes get.
  readonly style: Style;
  // The Routing most recently chosen, which new Arrows get.
  readonly routing: Routing;
  // The heads most recently chosen for each end, which new Arrows get.
  readonly arrowheads: Arrowheads;
  readonly selection: readonly ShapeId[];
  readonly interaction: Interaction;
  readonly viewport: viewport.Viewport;
  // While space is held, a press pans instead of using the active tool.
  readonly spaceHeld: boolean;
  // Where the pointer is over the Sketch, in screen pixels, and which modifiers are held, or `undefined` when it isn't
  // over it.
  readonly pointer: PointerState | undefined;
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

// Arrow ends bind to the Shapes they are let go on by default. Holding Alt turns that off, so they float wherever they
// are let go, like snapping to the grid, but the other way round.
function bindsEnds(modifiers: Modifiers): boolean {
  return !modifiers.alt;
}

function snapperFor(snaps: boolean): ((value: number) => number) {
  return (snaps ? snapToGrid : (value) => value);
}

export const emptySketch: Sketch = { shapes: {} };

// Sketches saved before Shapes had Labels and a style have Shapes without them, which get an empty Label and the
// default style. Those saved before a style had colours and strokes have Shapes with just a font size, and get the
// default for the rest. Those saved before Containers have every Shape at the top level, stacked in the order saved,
// and a JSON Sketch has no parent at the top level at all. Arrows came after all of these. Those saved before Arrows
// had heads and Labels get the default heads and an empty Label halfway along.
function completeShapes(sketch: Sketch): Sketch {
  const complete = (
    shape: Partial<SymbolShape> & Pick<SymbolShape, "id" | "symbol" | "bounds">,
    index: number,
  ): SymbolShape => ({
    ...newShape(shape.symbol, shape.bounds, defaultStyle),
    parent: undefined,
    z: index,
    ...shape,
    style: { ...defaultStyle, ...shape.style },
  });
  const completeArrow = (arrow: Omit<Arrow, "heads" | "label"> & Partial<Pick<Arrow, "heads" | "label">>): Arrow => ({
    heads: defaultArrowheads,
    label: newArrowLabel,
    ...arrow,
  });
  return {
    ...sketch,
    shapes: Object.fromEntries(
      Object.entries(sketch.shapes).map(([id, shape], index) => [
        id,
        isArrow(shape) ? completeArrow(shape) : complete(shape, index),
      ]),
    ),
  };
}

/**
 * A fresh editor on the `saved` Sketch, a new empty one by default. Nothing is selected and there is nothing to undo.
 * Sketches saved before Arrows belonged to Containers have every Arrow at the top level, and each joins the Container
 * it belongs to.
 */
export function createEditor(deps: Dependencies, saved: Sketch = emptySketch): EditorState {
  const sketch = settleArrows(completeShapes(saved), deps.measureText);
  return {
    deps,
    sketch,
    tool: "select",
    style: defaultStyle,
    routing: "straight",
    arrowheads: defaultArrowheads,
    selection: [],
    interaction: idle,
    viewport: viewport.initialViewport,
    spaceHeld: false,
    pointer: undefined,
    nextIdSequence: 1,
    history: history.startHistory(sketch),
  };
}

// What the user sees and points at is the Shape as displayed, grown to fit its Label.
function displayed(state: EditorState, shape: ShapeWithoutId): Bounds {
  return displayedBounds(shape, state.deps.measureText);
}

/** Where an Arrow is, as the Sketch is now. */
export function resolved(state: EditorState, arrow: ArrowWithoutId): ResolvedArrow | undefined {
  return resolveArrow(state.sketch, arrow, state.deps.measureText);
}

// The background of an Arrow's Label as displayed, or `undefined` when the Label shows nothing or the Arrow can't be
// placed.
function arrowLabelBackground(sketch: Sketch, arrow: ArrowWithoutId, measure: TextMeasurer): Bounds | undefined {
  const resolvedArrow = resolveArrow(sketch, arrow, measure);
  return resolvedArrow && layoutArrowLabel(arrow, resolvedArrow, measure).background;
}

// The smallest Bounds around any Shape as displayed: one made from a Symbol grown to fit its Label, or an Arrow's path
// and its Label. `undefined` for an Arrow that can't be placed.
function shapeBounds(sketch: Sketch, shape: Shape, measure: TextMeasurer): Bounds | undefined {
  if (isSymbolShape(shape)) return displayedBounds(shape, measure);
  const arrow = resolveArrow(sketch, shape, measure);
  const label = arrowLabelBackground(sketch, shape, measure);
  return arrow && enclosingBounds([boundsOfPoints(arrow.path), ...(label ? [label] : [])]);
}

// How far, in screen pixels, from an Arrow's line a press still hits it.
const lineReach = 6;

// A Shape made from a Symbol is hit-tested by its Symbol's outline, as if filled, even with a transparent fill.
function hitsSymbolShape(shape: SymbolShape, point: Point, measure: TextMeasurer): boolean {
  return hitsOutline(shape.symbol, displayedBounds(shape, measure), point);
}

// Whether `point` is on the Arrow's Label, as far as its background reaches.
function hitsArrowLabel(state: EditorState, arrow: Arrow, point: Point): boolean {
  const background = arrowLabelBackground(state.sketch, arrow, state.deps.measureText);
  return background !== undefined && contains(background, point);
}

// Arrows are hit-tested by their line and their Label.
function hits(state: EditorState, shape: Shape, point: Point): boolean {
  if (isSymbolShape(shape)) return hitsSymbolShape(shape, point, state.deps.measureText);
  const arrow = resolved(state, shape);
  return (
    arrow !== undefined &&
    (distanceToPolyline(arrow.path, point) <= sketchDistance(state, lineReach) || hitsArrowLabel(state, shape, point))
  );
}

// The topmost Shape under `point` that `eligible` allows.
function shapeAt(
  state: EditorState,
  point: Point,
  eligible: (shape: Shape) => boolean = () => true,
): Shape | undefined {
  return drawOrder(state.sketch).findLast((shape) => eligible(shape) && hits(state, shape, point));
}

function centre(bounds: Bounds): Point {
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

function isContainer(shape: ShapeWithoutId): boolean {
  return symbolDefinition(shape.symbol).canBeContainer;
}

// The Shapes made from a Symbol among `shapes`, in the same order.
function symbolShapes(shapes: readonly Shape[]): readonly SymbolShape[] {
  return shapes.filter(isSymbolShape);
}

// The innermost Container under `point` that `eligible` allows. Of overlapping Containers that are not inside each
// other, the topmost counts as the innermost.
function containerAt(
  sketch: Sketch,
  point: Point,
  measure: TextMeasurer,
  eligible: (container: SymbolShape) => boolean = () => true,
): SymbolShape | undefined {
  return symbolShapes(drawOrder(sketch)).findLast(
    (shape) => isContainer(shape) && eligible(shape) && hitsSymbolShape(shape, point, measure),
  );
}

// Where an Arrow end counts as being: in the Container its Shape is in when bound, or in the innermost Container under
// it when floating.
function endContainer(sketch: Sketch, end: ArrowEnd, measure: TextMeasurer): ShapeId | undefined {
  return end.kind === "floating" ? containerAt(sketch, end.at, measure)?.id : sketch.shapes[end.shape]?.parent;
}

// An Arrow belongs to the innermost Container holding both its ends, or to the top level when there is none, such as
// when it crosses a Container's boundary.
function arrowParent(sketch: Sketch, arrow: ArrowWithoutId, measure: TextMeasurer): ShapeId | undefined {
  return innermostCommon(sketch, endContainer(sketch, arrow.start, measure), endContainer(sketch, arrow.end, measure));
}

// Each Arrow joins the Container it belongs to, on top of the Shapes there, unless it is in there already.
function settleArrows(sketch: Sketch, measure: TextMeasurer): Sketch {
  return drawOrder(sketch)
    .filter(isArrow)
    .reduce((settled, arrow) => moveInto(settled, arrow.id, arrowParent(settled, arrow, measure)), sketch);
}

// Moves a Shape into `parent`, on top of the Shapes already there, unless it is in there already.
function moveInto(sketch: Sketch, id: ShapeId, parent: ShapeId | undefined): Sketch {
  return sketch.shapes[id]?.parent === parent
    ? sketch
    : updateShape(sketch, id, (shape) => ({ ...shape, ...onTopIn(sketch, parent) }));
}

// After a move, each moved Shape joins the innermost Container under its centre, or the top level when there is none.
// The Shapes inside it come along, so it can't join one of them. Each is settled in turn, so two moved Containers
// can't each join the other.
function settleMoved(state: EditorState, ids: readonly ShapeId[]): EditorState {
  return outermost(state.sketch, ids).reduce((settled, id) => {
    const shape = settled.sketch.shapes[id];
    // Arrows join their Containers by their ends instead, once the editor is idle again.
    if (!shape || isArrow(shape)) return settled;
    const container = containerAt(
      settled.sketch,
      centre(displayed(settled, shape)),
      settled.deps.measureText,
      (candidate) => !isWithin(settled.sketch, candidate.id, id),
    );
    return { ...settled, sketch: moveInto(settled.sketch, id, container?.id) };
  }, state);
}

function shapesInside(state: EditorState, box: Bounds): readonly ShapeId[] {
  return Object.values(state.sketch.shapes)
    .filter((shape) => {
      const bounds = shapeBounds(state.sketch, shape, state.deps.measureText);
      return bounds !== undefined && containsBounds(box, bounds);
    })
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

// The one selected Shape, if just one is selected.
function selectedAlone(state: EditorState): Shape | undefined {
  const [id, ...others] = state.selection;
  return id !== undefined && others.length === 0 ? state.sketch.shapes[id] : undefined;
}

/** The one selected Shape, when it is made from a Symbol, which is the only time resize handles are shown. */
export function resizableShape(state: EditorState): SymbolShape | undefined {
  const shape = selectedAlone(state);
  return shape && isSymbolShape(shape) ? shape : undefined;
}

/** The one selected Shape, when it is an Arrow, which is the only time handles on its ends are shown. */
export function selectedArrow(state: EditorState): Arrow | undefined {
  const shape = selectedAlone(state);
  return shape && isArrow(shape) ? shape : undefined;
}

/** A handle on an end of the selected Arrow, which is dragged to move that end. */
export type ArrowEndHandleView = { readonly end: EndName; readonly position: Point };

/** The handles on the ends of the one selected Shape, when it is an Arrow. */
export function arrowEndHandles(state: EditorState): readonly ArrowEndHandleView[] {
  const arrow = selectedArrow(state);
  const resolvedArrow = arrow && resolved(state, arrow);
  return resolvedArrow
    ? [
        { end: "start", position: resolvedArrow.start },
        { end: "end", position: resolvedArrow.end },
      ]
    : [];
}

/** The handle on the middle segment of the selected elbow Arrow, which is dragged along `axis` to move it sideways. */
export type MiddleSegmentHandleView = { readonly position: Point; readonly axis: Axis };

/** The handle on the middle segment of the one selected Shape, when it is an elbow Arrow with a middle segment. */
export function middleSegmentHandle(state: EditorState): MiddleSegmentHandleView | undefined {
  const arrow = selectedArrow(state);
  const middle = arrow && resolved(state, arrow)?.middle;
  return middle
    ? {
        position: { x: (middle.from.x + middle.to.x) / 2, y: (middle.from.y + middle.to.y) / 2 },
        axis: middle.axis,
      }
    : undefined;
}

// A distance in screen pixels, such as the drag threshold, as a distance on the Sketch at the current zoom.
function sketchDistance(state: EditorState, screenDistance: number): number {
  return screenDistance / state.viewport.zoom;
}

// Whether a press at `point` grabs the handle at `position`.
function grabsHandle(state: EditorState, position: Point, point: Point): boolean {
  const reach = sketchDistance(state, handleReach);
  return Math.abs(position.x - point.x) <= reach && Math.abs(position.y - point.y) <= reach;
}

function handleAt(state: EditorState, point: Point): { shape: SymbolShape; handle: ResizeHandle } | undefined {
  const shape = resizableShape(state);
  const nearby = shape
    ? handlePositions(displayed(state, shape)).find(({ position }) => grabsHandle(state, position, point))
    : undefined;
  return shape && nearby ? { shape, handle: nearby.handle } : undefined;
}

function arrowEndAt(state: EditorState, point: Point): { arrow: Arrow; end: EndName } | undefined {
  const arrow = selectedArrow(state);
  const nearby = arrowEndHandles(state).find(({ position }) => grabsHandle(state, position, point));
  return arrow && nearby ? { arrow, end: nearby.end } : undefined;
}

function middleSegmentAt(state: EditorState, point: Point): Arrow | undefined {
  const arrow = selectedArrow(state);
  const handle = middleSegmentHandle(state);
  return arrow && handle && grabsHandle(state, handle.position, point) ? arrow : undefined;
}

function pressWithSelectTool(state: EditorState, input: PointerInput): EditorState {
  const grabbedEnd = arrowEndAt(state, input.position);
  if (grabbedEnd) {
    return {
      ...state,
      interaction: {
        kind: "draggingArrowEnd",
        arrowId: grabbedEnd.arrow.id,
        end: grabbedEnd.end,
        binds: bindsEnds(input.modifiers),
        origin: input.position,
        current: input.position,
        before: state.sketch,
        dragged: false,
      },
    };
  }
  const grabbedSegment = middleSegmentAt(state, input.position);
  if (grabbedSegment) {
    return {
      ...state,
      interaction: {
        kind: "draggingElbowSegment",
        arrowId: grabbedSegment.id,
        origin: input.position,
        current: input.position,
        before: state.sketch,
        dragged: false,
      },
    };
  }
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
  // A press on an Arrow's Label grabs the Label, to drag along the Arrow, and selects just that Arrow. With shift, it
  // adds the Arrow to the selection or takes it out, as a press anywhere on the Arrow does.
  if (isArrow(hit) && !shift && hitsArrowLabel(state, hit, input.position)) {
    return {
      ...state,
      selection: [hit.id],
      interaction: {
        kind: "draggingArrowLabel",
        arrowId: hit.id,
        origin: input.position,
        current: input.position,
        before: state.sketch,
        dragged: false,
      },
    };
  }
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

function translatePoint(point: Point, offset: Point): Point {
  return { x: point.x + offset.x, y: point.y + offset.y };
}

// An Arrow is moved only when both its ends float. A bound end follows its Shape instead, and the Arrow with it.
function movesItself(shape: Shape): boolean {
  return isSymbolShape(shape) || (shape.start.kind === "floating" && shape.end.kind === "floating");
}

function translateEnd(end: ArrowEnd, offset: Point): ArrowEnd {
  return end.kind === "floating" ? { ...end, at: translatePoint(end.at, offset) } : end;
}

// An Arrow carried along inside a moved Container moves its floating ends, as its bound ends follow Shapes that move
// with it too.
function translateShape(shape: Shape, offset: Point, carried: boolean): Shape {
  if (isSymbolShape(shape)) return { ...shape, bounds: translate(shape.bounds, offset) };
  return carried || movesItself(shape)
    ? { ...shape, start: translateEnd(shape.start, offset), end: translateEnd(shape.end, offset) }
    : shape;
}

// The Shapes inside them come along.
function moveShapes(sketch: Sketch, ids: readonly ShapeId[], offset: Point): Sketch {
  const carried = (id: ShapeId) => ids.some((ancestor) => ancestor !== id && isWithin(sketch, id, ancestor));
  return {
    ...sketch,
    shapes: {
      ...sketch.shapes,
      ...Object.fromEntries(
        withDescendants(sketch, ids)
          .map((id) => sketch.shapes[id])
          .filter((shape) => shape !== undefined)
          .map((shape) => [shape.id, translateShape(shape, offset, carried(shape.id))]),
      ),
    },
  };
}

// The Bounds around the selected Shapes that move, which move as one block, or `undefined` when none of them does.
function selectionBlock(sketch: Sketch, selection: readonly ShapeId[], measure: TextMeasurer): Bounds | undefined {
  const all = selection.flatMap((id) => {
    const shape = sketch.shapes[id];
    if (!shape || !movesItself(shape)) return [];
    return isSymbolShape(shape) ? [shape.bounds] : (shapeBounds(sketch, shape, measure) ?? []);
  });
  return all.length === 0 ? undefined : enclosingBounds(all);
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
  const block = selectionBlock(drag.before, state.selection, state.deps.measureText);
  if (!block) return offset;
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
  if (!shape || isArrow(shape) || !interaction.dragged) return { ...state, sketch: before, interaction };
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

// How far, in screen pixels, from a Port an Arrow end snaps to it, so snapping feels the same at every zoom.
const portReach = 10;

// How close, in screen pixels, to a Shape's outline an Arrow end binds to it. Further away, even inside the Shape, it
// floats, so a Container never takes an end let go beside one of its children.
const outlineReach = 6;

// The end an Arrow gets when it is let go at `point` on `sketch`, or a floating end when it doesn't bind.
function endLetGo(state: EditorState, sketch: Sketch, point: Point, binds: boolean): ArrowEnd {
  if (!binds) return { kind: "floating", at: point };
  const reach = { port: sketchDistance(state, portReach), outline: sketchDistance(state, outlineReach) };
  return endLetGoAt(sketch, point, reach, state.deps.measureText);
}

// The dragged end is placed wherever the pointer is, once the pointer has travelled past the drag threshold.
function dragArrowEnd(
  state: EditorState,
  interaction: Extract<Interaction, { kind: "draggingArrowEnd" }>,
): EditorState {
  const { before, arrowId, end, current, binds } = interaction;
  const arrow = before.shapes[arrowId];
  if (!arrow || !isArrow(arrow) || !interaction.dragged) return { ...state, sketch: before, interaction };
  const replaced: Arrow = { ...arrow, [end]: endLetGo(state, before, current, binds) };
  return { ...state, sketch: { ...before, shapes: { ...before.shapes, [arrowId]: replaced } }, interaction };
}

// The middle segment moves along its axis as far as the pointer has, but stops short of the ends.
function dragElbowSegment(
  state: EditorState,
  interaction: Extract<Interaction, { kind: "draggingElbowSegment" }>,
  pointer: PointerState,
): EditorState {
  const { before, arrowId } = interaction;
  const arrow = before.shapes[arrowId];
  const middle = arrow && isArrow(arrow) ? resolveArrow(before, arrow, state.deps.measureText)?.middle : undefined;
  if (!arrow || !isArrow(arrow) || !middle) return { ...state, sketch: before, interaction };
  const offset = offsetDraggedBy(middle, pointerOffset(interaction, pointer));
  const replaced: Arrow = offset ? { ...arrow, elbowOffset: offset } : withoutOffset(arrow);
  return { ...state, sketch: { ...before, shapes: { ...before.shapes, [arrowId]: replaced } }, interaction };
}

// The Label moves along the path as far as the pointer has, to the point on the path nearest to where the pointer would
// have taken it, so it never leaves the path, nor goes past either end.
function dragArrowLabel(
  state: EditorState,
  interaction: Extract<Interaction, { kind: "draggingArrowLabel" }>,
  pointer: PointerState,
): EditorState {
  const { before, arrowId } = interaction;
  const arrow = before.shapes[arrowId];
  const resolvedArrow = arrow && isArrow(arrow) ? resolveArrow(before, arrow, state.deps.measureText) : undefined;
  if (!arrow || !isArrow(arrow) || !resolvedArrow || !interaction.dragged) {
    return { ...state, sketch: before, interaction };
  }
  const target = translatePoint(labelPoint(resolvedArrow, arrow.label), pointerOffset(interaction, pointer));
  const replaced: Arrow = { ...arrow, label: { ...arrow.label, along: shareAlongPolyline(resolvedArrow.path, target) } };
  return { ...state, sketch: { ...before, shapes: { ...before.shapes, [arrowId]: replaced } }, interaction };
}

function dragTo(
  state: EditorState,
  interaction: Extract<
    Interaction,
    { kind: "moving" | "resizing" | "draggingArrowEnd" | "draggingElbowSegment" | "draggingArrowLabel" }
  >,
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
    case "draggingArrowEnd":
      return dragArrowEnd(state, {
        ...continuePress(state, interaction, pointer),
        binds: bindsEnds(pointer.modifiers),
      });
    case "draggingElbowSegment":
      return dragElbowSegment(state, continuePress(state, interaction, pointer), pointer);
    case "draggingArrowLabel":
      return dragArrowLabel(state, continuePress(state, interaction, pointer), pointer);
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
    case "arrow": {
      const binds = bindsEnds(input.modifiers);
      return {
        ...state,
        interaction: {
          kind: "drawingArrow",
          start: endLetGo(state, state.sketch, input.position, binds),
          binds,
          origin: input.position,
          current: input.position,
          dragged: false,
        },
      };
    }
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
    case "drawingArrow":
      return {
        ...state,
        interaction: { ...continuePress(state, interaction, input), binds: bindsEnds(input.modifiers) },
      };
    case "moving":
    case "resizing":
    case "draggingArrowEnd":
    case "draggingElbowSegment":
    case "draggingArrowLabel":
      return dragTo(state, interaction, input);
    case "panning":
      return { ...state, viewport: viewport.keepUnderPointer(state.viewport, interaction.grabbed, input.position) };
  }
}

function updateShape(sketch: Sketch, id: ShapeId, change: (shape: Shape) => Shape): Sketch {
  const shape = sketch.shapes[id];
  return shape ? { ...sketch, shapes: { ...sketch.shapes, [id]: change(shape) } } : sketch;
}

// Changes a Shape made from a Symbol, and leaves an Arrow as it is.
function onSymbolShape(change: (shape: SymbolShape) => SymbolShape): (shape: Shape) => Shape {
  return (shape) => (isSymbolShape(shape) ? change(shape) : shape);
}

// Shapes made from a Symbol and Arrows have Labels of their own kinds, so each is changed as what it is.
function withLabelText(sketch: Sketch, id: ShapeId, text: string): Sketch {
  return updateShape(sketch, id, (shape) =>
    isArrow(shape) ? { ...shape, label: { ...shape.label, text } } : { ...shape, label: { ...shape.label, text } },
  );
}

// Only one Shape is selected while its Label is being edited, whether it is made from a Symbol or an Arrow.
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

// Whether the selected Shapes can be changed. They can while a Label is being edited, and the change is then part of
// its editing session, but not in the middle of a gesture, which would undo the change on the next pointer move.
function canChangeSelected(state: EditorState): boolean {
  return isIdle(state) || state.interaction.kind === "editingLabel";
}

function changeSelected(state: EditorState, change: (shape: Shape) => Shape): EditorState {
  if (!canChangeSelected(state)) return state;
  return { ...state, sketch: state.selection.reduce((sketch, id) => updateShape(sketch, id, change), state.sketch) };
}

// A style chosen applies to every selected Shape, and to the Shapes drawn from now on, even with nothing selected. Only
// the values a style can have are taken, so no colour outside the palette gets in.
function chooseStyle(state: EditorState, style: Partial<Style>): EditorState {
  if (!canChangeSelected(state)) return state;
  const chosen = validStyle(style);
  const changed = changeSelected(state, (shape) => ({ ...shape, style: { ...shape.style, ...chosen } }));
  return { ...changed, style: { ...state.style, ...chosen } };
}

// A Routing chosen applies to every selected Arrow, and to the Arrows drawn from now on, as a style does. An offset
// dragged into an elbow path goes with the old Routing.
function chooseRouting(state: EditorState, routing: Routing): EditorState {
  if (!canChangeSelected(state)) return state;
  const changed = changeSelected(state, (shape) =>
    isArrow(shape) && shape.routing !== routing ? { ...withoutOffset(shape), routing } : shape,
  );
  return { ...changed, routing };
}

// A head chosen for an end applies to that end of every selected Arrow, and to the Arrows drawn from now on, as a
// Routing does. Only the heads there are are taken.
function chooseArrowhead(state: EditorState, end: EndName, arrowhead: Arrowhead): EditorState {
  if (!canChangeSelected(state) || !arrowheads.includes(arrowhead)) return state;
  const changed = changeSelected(state, (shape) =>
    isArrow(shape) ? { ...shape, heads: { ...shape.heads, [end]: arrowhead } } : shape,
  );
  return { ...changed, arrowheads: { ...state.arrowheads, [end]: arrowhead } };
}

// Removes a Shape that is nothing but its Label once that Label is left empty, as nothing of it would show. Text that
// is only spaces and line breaks counts as empty.
function removeIfEmpty(state: EditorState, id: ShapeId): EditorState {
  const shape = state.sketch.shapes[id];
  return shape && isSymbolShape(shape) && symbolDefinition(shape.symbol).labelOnly && shape.label.text.trim() === ""
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

function addShape(sketch: Sketch, shape: Shape): Sketch {
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

// Whether `container`'s outline covers the centre of `other`.
function coversCentre(state: EditorState, container: ShapeWithoutId, other: SymbolShape): boolean {
  return hitsOutline(container.symbol, displayed(state, container), centre(displayed(state, other)));
}

// A new Container adopts the Shapes beside it whose centres it covers, and the Shapes inside them come along.
function adoptCovered(state: EditorState, container: SymbolShape): Sketch {
  const covered = isContainer(container)
    ? symbolShapes(childrenOf(state.sketch, container.parent)).filter(
        (shape) => shape.id !== container.id && coversCentre(state, container, shape),
      )
    : [];
  return covered.reduce(
    (sketch, { id }) => updateShape(sketch, id, (shape) => ({ ...shape, parent: container.id })),
    state.sketch,
  );
}

function area({ width, height }: Bounds): number {
  return width * height;
}

// A new Shape joins the innermost Container under its centre, on top of the Shapes there. A new Container never joins
// one no bigger than itself whose centre it covers, as it adopts that one instead, such as when drawn around a cluster
// with its centre on the cluster. Nor does it join a Shape inside that one, such as a child sticking out of it.
function containerForNew(state: EditorState, shape: ShapeWithoutId): ShapeId | undefined {
  const bounds = displayed(state, shape);
  const covered = isContainer(shape)
    ? symbolShapes(Object.values(state.sketch.shapes)).filter(
        (other) => area(displayed(state, other)) <= area(bounds) && coversCentre(state, shape, other),
      )
    : [];
  return containerAt(
    state.sketch,
    centre(bounds),
    state.deps.measureText,
    (candidate) => !covered.some(({ id }) => isWithin(state.sketch, candidate.id, id)),
  )?.id;
}

// A new Shape becomes the selection, so it can be adjusted straight away, and its Label opens for editing. A new
// Container takes in the Arrows it now holds both ends of straight away, rather than once its Label is finished.
function createShape(state: EditorState, symbol: SymbolId, bounds: Bounds): EditorState {
  const sequence = freeIdSequence(state, state.nextIdSequence);
  const drawn = newShape(symbol, bounds, state.style);
  const parent = containerForNew(state, drawn);
  const shape: SymbolShape = { id: state.deps.generateId(sequence), ...onTopIn(state.sketch, parent), ...drawn };
  const adopted = adoptCovered({ ...state, sketch: addShape(state.sketch, shape) }, shape);
  return {
    ...state,
    sketch: settleArrows(adopted, state.deps.measureText),
    selection: [shape.id],
    nextIdSequence: sequence + 1,
  };
}

// Where an Arrow end is being placed, and whether it binds there: under the pointer while hovering with the Arrow
// tool, or where the end being drawn or dragged is.
function arrowEndBeingPlaced(state: EditorState): { point: Point; binds: boolean } | undefined {
  const { interaction, pointer } = state;
  if (interaction.kind === "drawingArrow") return { point: interaction.current, binds: interaction.binds };
  if (interaction.kind === "draggingArrowEnd") {
    return interaction.dragged ? { point: interaction.current, binds: interaction.binds } : undefined;
  }
  const hovering = isIdle(state) && state.tool === "arrow" && !state.spaceHeld;
  return hovering && pointer
    ? { point: viewport.toSketch(state.viewport, pointer.position), binds: bindsEnds(pointer.modifiers) }
    : undefined;
}

/**
 * The Shape whose Ports are shown, as an Arrow end is being placed over it, and the place in its list of Ports of the
 * Port the end would snap to, if any. That is the Shape the end would bind to, or else the topmost Shape under it, so
 * its Ports show where to aim.
 */
export function portTarget(state: EditorState): { shape: SymbolShape; snapsTo: number | undefined } | undefined {
  const placing = arrowEndBeingPlaced(state);
  if (!placing) return undefined;
  const end = endLetGo(state, state.sketch, placing.point, placing.binds);
  const bound = boundTo(end);
  const shape = bound === undefined ? shapeAt(state, placing.point, isSymbolShape) : state.sketch.shapes[bound];
  return shape && isSymbolShape(shape) ? { shape, snapsTo: end.kind === "port" ? end.port : undefined } : undefined;
}

/**
 * The Arrow that letting go of the pointer now would create, once the pointer has been dragged. There is none while
 * both its ends would land on the same point, such as on the same Port, as it would not show.
 */
export function arrowBeingDrawn(state: EditorState): ArrowWithoutId | undefined {
  const { interaction } = state;
  if (interaction.kind !== "drawingArrow" || !interaction.dragged) return undefined;
  const arrow: ArrowWithoutId = {
    style: state.style,
    routing: state.routing,
    heads: state.arrowheads,
    label: newArrowLabel,
    start: interaction.start,
    end: endLetGo(state, state.sketch, interaction.current, interaction.binds),
  };
  const resolvedArrow = resolved(state, arrow);
  return resolvedArrow && distance(resolvedArrow.start, resolvedArrow.end) > 0 ? arrow : undefined;
}

// A new Arrow goes on top of the Shapes in the Container it belongs to and becomes the selection, so it can be adjusted
// straight away.
function createArrow(state: EditorState, drawn: ArrowWithoutId): EditorState {
  const sequence = freeIdSequence(state, state.nextIdSequence);
  const parent = arrowParent(state.sketch, drawn, state.deps.measureText);
  const arrow: Arrow = { id: state.deps.generateId(sequence), ...onTopIn(state.sketch, parent), ...drawn };
  return {
    ...state,
    sketch: addShape(state.sketch, arrow),
    selection: [arrow.id],
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
    // A click without dragging draws nothing, and the Arrow tool stays on.
    case "drawingArrow": {
      const drawn = arrowBeingDrawn(moved);
      return drawn ? { ...createArrow(finished, drawn), tool: "select" } : finished;
    }
    case "moving": {
      if (interaction.dragged) return settleMoved(finished, finished.selection);
      const clicked = interaction.selectsOnClick;
      return clicked === undefined ? finished : { ...finished, selection: [clicked] };
    }
    case "idle":
    case "marqueeSelecting":
    case "resizing":
    case "draggingArrowEnd":
    case "draggingElbowSegment":
    case "draggingArrowLabel":
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
    case "drawingArrow":
    case "panning":
      return cancelled;
    // Editing a Label is not a pointer gesture, so a lost pointer leaves it open.
    case "editingLabel":
      return state;
    case "marqueeSelecting":
      return { ...cancelled, selection: interaction.previousSelection };
    case "moving":
    case "resizing":
    case "draggingArrowEnd":
    case "draggingElbowSegment":
    case "draggingArrowLabel":
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
  const block = selectionBlock(state.sketch, state.selection, state.deps.measureText);
  if (!block) return { x: 0, y: 0 };
  return {
    x: direction.x === 0 ? 0 : nextGridLine(block.x, direction.x) - block.x,
    y: direction.y === 0 ? 0 : nextGridLine(block.y, direction.y) - block.y,
  };
}

// A nudge is a move like a drag, so the Shapes nudged may join or leave a Container.
function nudge(state: EditorState, direction: Point, modifiers: Modifiers): EditorState {
  if (state.selection.length === 0) return state;
  const sketch = moveShapes(state.sketch, state.selection, nudgeOffset(state, direction, modifiers));
  return settleMoved({ ...state, sketch }, state.selection);
}

// The Shapes inside them go too. Arrows bound to them stay, with those ends floating where they were.
function removeShapes(state: EditorState, ids: readonly ShapeId[]): EditorState {
  const removed = withDescendants(state.sketch, ids);
  const unbound = unbindFrom(state.sketch, removed, state.deps.measureText);
  return {
    ...state,
    sketch: {
      ...unbound,
      shapes: Object.fromEntries(Object.entries(unbound.shapes).filter(([id]) => !removed.includes(id))),
    },
    selection: state.selection.filter((id) => !removed.includes(id)),
  };
}

function deleteSelection(state: EditorState): EditorState {
  return removeShapes(state, state.selection);
}

// `]` brings the selection to the front and `[` sends it to the back, or with Cmd/Ctrl one step.
const reorderKeys: Readonly<Record<string, { readonly all: Reorder; readonly step: Reorder }>> = {
  "]": { all: bringToFront, step: bringForward },
  "[": { all: sendToBack, step: sendBackward },
};

// Pressing or releasing a modifier mid-drag, such as Alt for snapping, applies to the drag straight away,
// without waiting for the pointer to move.
function updateDragModifiers(state: EditorState, modifiers: Modifiers): EditorState {
  const { interaction } = state;
  switch (interaction.kind) {
    case "creatingShape":
      return { ...state, interaction: { ...interaction, snaps: snapsToGrid(modifiers) } };
    case "drawingArrow":
      return { ...state, interaction: { ...interaction, binds: bindsEnds(modifiers) } };
    case "moving":
    case "resizing":
    case "draggingArrowEnd":
      return dragTo(state, interaction, { position: interaction.current, modifiers });
    case "idle":
    case "marqueeSelecting":
    case "draggingElbowSegment":
    case "draggingArrowLabel":
    case "panning":
    case "editingLabel":
      return state;
  }
}

// Space is tracked on its own, whatever else is going on, as a press while it is held pans. So are the modifiers held
// while the pointer hovers, which decide whether an Arrow end would bind there.
function trackKeys(state: EditorState, input: KeyInput): EditorState {
  const { pointer } = state;
  return {
    ...state,
    spaceHeld: input.key === " " ? input.type === "keyDown" : state.spaceHeld,
    pointer: pointer && { ...pointer, modifiers: input.modifiers },
  };
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
  if (input.key === "Enter") return startEditingLabel(state, selectedAlone(state)?.id);
  const direction = nudgeDirections[input.key];
  if (direction) return nudge(state, direction, input.modifiers);
  const reorder = reorderKeys[input.key];
  if (reorder) {
    return { ...state, sketch: restack(state.sketch, state.selection, command ? reorder.step : reorder.all) };
  }
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
  const all = Object.values(sketch.shapes).flatMap((shape) => shapeBounds(sketch, shape, measure) ?? []);
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
    case "pointerMove": {
      const tracked = { ...state, pointer: { position: input.position, modifiers: input.modifiers } };
      return pointerMove(tracked, inSketch(state, input));
    }
    case "pointerLeave":
      return { ...state, pointer: undefined };
    case "pointerUp":
      return pointerUp(state, inSketch(state, input));
    case "pointerCancel":
      return cancelGesture(state);
    case "doubleClick":
      return doubleClick(state, viewport.toSketch(state.viewport, input.position));
    case "keyDown":
      return keyDown(trackKeys(state, input), input);
    case "keyUp":
      return updateDragModifiers(trackKeys(state, input), input.modifiers);
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
      return chooseStyle(state, input.style);
    case "changeLabelAlignment":
      return changeSelected(
        state,
        onSymbolShape((shape) => ({
          ...shape,
          label: { ...shape.label, alignment: { ...shape.label.alignment, ...input.alignment } },
        })),
      );
    case "changeRouting":
      return chooseRouting(state, input.routing);
    case "changeArrowhead":
      return chooseArrowhead(state, input.end, input.arrowhead);
  }
}

// A change to the Sketch is recorded once the editor is idle again, so a whole gesture, or any longer interaction,
// is one step, and a cancelled one, which puts the Sketch back, records nothing. Offsets that the change made no longer
// fit their elbow paths are dropped then, so they stay dropped, even if the Shapes move back. Until then, such as while
// the Shapes are still being dragged, the paths only leave them out. Each Arrow also joins the Container it now belongs
// to then, whatever the change was, such as a move, a dragged end, a delete or a resize.
export function update(state: EditorState, input: Input): EditorState {
  const next = applyInput(state, input);
  if (!isIdle(next)) return next;
  const { measureText } = next.deps;
  const sketch =
    next.sketch === next.history.present
      ? next.sketch
      : settleArrows(withoutStaleOffsets(next.sketch, measureText), measureText);
  return { ...next, sketch, history: history.record(next.history, sketch) };
}
