import { boundTo, endPoint, type Arrow, type ArrowEnd } from "./arrow";
import type { Shape, ShapeId, Sketch, TextMeasurer } from "./editor";
import { isArrow } from "./shape-kind";
import { symbolIds } from "./symbols";
import { withDescendants } from "./tree";

/**
 * Shapes copied from a Sketch, to paste into this or another one. Each keeps its ID from there, which the Shapes inside
 * it and the Arrows bound to it refer to. A Shape whose parent is not among them was copied on its own.
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
  const float = (end: ArrowEnd): ArrowEnd => {
    const at = endPoint(sketch, end, measure);
    return at ? { kind: "floating", at } : end;
  };
  return { ...arrow, start: float(arrow.start), end: float(arrow.end) };
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

// Only a rough check that the text holds Shapes, as Skisse writes them: an Arrow, or a Shape made from a known Symbol.
function isShape(value: unknown): value is Shape {
  return (
    isObject(value) &&
    typeof value.id === "string" &&
    ("routing" in value || symbolIds.some((symbol) => symbol === value.symbol))
  );
}

/** The Shapes in text from the system clipboard, or `undefined` when it isn't Shapes copied from Skisse. */
export function clipboardFromText(text: string): Clipboard | undefined {
  try {
    const value: unknown = JSON.parse(text);
    if (!isObject(value) || value.format !== format) return undefined;
    const { shapes } = value;
    return Array.isArray(shapes) && shapes.every(isShape) ? { shapes } : undefined;
  } catch {
    return undefined;
  }
}
