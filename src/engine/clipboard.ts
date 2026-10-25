import { boundTo, floatedInPlace, type Arrow, type ArrowEnd } from "./arrow";
import type { Shape, ShapeId, Sketch, TextMeasurer } from "./editor";
import type { Bounds, Point } from "./geometry";
import { isArrow, isSymbolShape } from "./shape-kind";
import { symbolIds } from "./symbols";
import { withDescendants } from "./tree";

/**
 * Shapes copied from a Sketch, to paste into this or another one. Each keeps its ID from there, which the Shapes inside
 * it and the Arrows bound to it refer to. A Shape whose parent is not among them is outermost: it was copied itself,
 * rather than along with its Container.
 */
export type Clipboard = { readonly shapes: readonly Shape[] };

// Marks clipboard text as Skisse's, so text copied from anywhere else is never taken for Shapes.
const format = "skisse/shapes";

// An Arrow keeps its Bindings only when every Shape it is bound to is copied too. Otherwise both its ends float where
// they are, so it doesn't bind to the originals, nor to just one of the copies.
function detached(sketch: Sketch, arrow: Arrow, copied: readonly ShapeId[], measure: TextMeasurer): Arrow {
  const keepsBindings = [arrow.start, arrow.end].every((end) => {
    const shape = boundTo(end);
    return shape === undefined || copied.includes(shape);
  });
  if (keepsBindings) return arrow;
  return { ...arrow, start: floatedInPlace(sketch, arrow.start, measure), end: floatedInPlace(sketch, arrow.end, measure) };
}

/**
 * The Shapes of `ids` copied from `sketch`, as drawn, or `undefined` when there are none. The Shapes inside them come
 * along, Arrows owned by a Container among them, but not the other Arrows bound to them.
 */
export function copyShapes(sketch: Sketch, ids: readonly ShapeId[], measure: TextMeasurer): Clipboard | undefined {
  const copied = withDescendants(sketch, ids);
  const shapes = copied
    .map((id) => sketch.shapes[id])
    .filter((shape) => shape !== undefined)
    .map((shape) => (isArrow(shape) ? detached(sketch, shape, copied, measure) : shape));
  return shapes.length === 0 ? undefined : { shapes };
}

/** The copied Shapes as text for the system clipboard. */
export function clipboardToText(clipboard: Clipboard): string {
  return JSON.stringify({ format, shapes: clipboard.shapes });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPoint(value: unknown): value is Point {
  return isObject(value) && typeof value.x === "number" && typeof value.y === "number";
}

function isBounds(value: unknown): value is Bounds {
  return isObject(value) && [value.x, value.y, value.width, value.height].every((n) => typeof n === "number");
}

function isEnd(value: unknown): value is ArrowEnd {
  if (!isObject(value)) return false;
  switch (value.kind) {
    case "floating":
      return isPoint(value.at);
    case "port":
      return typeof value.shape === "string" && typeof value.port === "number";
    case "outline":
      return typeof value.shape === "string" && isPoint(value.at);
    default:
      return false;
  }
}

// Only a rough check that the text holds Shapes as Skisse writes them, with what it takes to place them: an Arrow with
// its ends, or a Shape made from a known Symbol with its Bounds. What else they lack, such as a style, gets the default,
// as for a Sketch saved before Shapes had it. An Arrow is told apart by its Routing, as `isArrow` does.
function isShape(value: unknown): value is Shape {
  if (!isObject(value) || typeof value.id !== "string") return false;
  return "routing" in value
    ? isEnd(value.start) && isEnd(value.end)
    : symbolIds.some((symbol) => symbol === value.symbol) && isBounds(value.bounds);
}

// Whether the Shapes hang together as copying leaves them: each with an ID of its own, each Arrow end bound to a Shape
// among them made from a Symbol, and each Shape inside one made from a Symbol, or outermost, but never inside itself.
function fitsTogether(shapes: readonly Shape[]): boolean {
  const byId = new Map(shapes.map((shape) => [shape.id, shape]));
  const isSymbolShapeAmong = (id: ShapeId) => {
    const shape = byId.get(id);
    return shape !== undefined && isSymbolShape(shape);
  };
  const boundWithin = (end: ArrowEnd) => {
    const shape = boundTo(end);
    return shape === undefined || isSymbolShapeAmong(shape);
  };
  // A Shape is outermost when a chain of parents through the Shapes reaches outside them before going round in a loop.
  const reachesOutside = (shape: Shape, steps: number): boolean => {
    const parent = shape.parent === undefined ? undefined : byId.get(shape.parent);
    return parent === undefined || (steps > 0 && reachesOutside(parent, steps - 1));
  };
  return (
    byId.size === shapes.length &&
    shapes.every(
      (shape) =>
        (shape.parent === undefined || !byId.has(shape.parent) || isSymbolShapeAmong(shape.parent)) &&
        reachesOutside(shape, shapes.length) &&
        (!isArrow(shape) || (boundWithin(shape.start) && boundWithin(shape.end))),
    )
  );
}

/** The Shapes in text from the system clipboard, or `undefined` when it isn't Shapes copied from Skisse. */
export function clipboardFromText(text: string): Clipboard | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value) || value.format !== format) return undefined;
    const { shapes } = value;
    return Array.isArray(shapes) && shapes.every(isShape) && fitsTogether(shapes) ? { shapes } : undefined;
  } catch {
    return undefined;
  }
}
