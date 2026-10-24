import type { Shape, ShapeId, Sketch, SymbolShape, TextMeasurer } from "./editor";
import { elbowRoute, type ElbowOffset, type Lead, type Middle } from "./elbow";
import { contains, distance, type Bounds, type Point } from "./geometry";
import { displayedBounds } from "./label";
import { insidePath, nearestOnPath } from "./path";
import { shapeGeometry, type ShapeGeometry } from "./shape-geometry";
import type { Style } from "./style";
import { drawOrder } from "./tree";

/** How an Arrow's path runs between its ends. `curved` is kept for later, and drawn straight until then. */
export type Routing = "straight" | "elbow" | "curved";

/** Where an Arrow end is. A bound end follows its Shape when the Shape moves or is resized. */
export type ArrowEnd =
  // At one of the Shape's Ports, by its place in the Symbol's list of Ports.
  | { readonly kind: "port"; readonly shape: ShapeId; readonly port: number }
  // At a point on the Shape's outline, stored as a share of the Shape's width and height as displayed, from its
  // top-left corner, so it keeps its place along the outline when the Shape is resized.
  | { readonly kind: "outline"; readonly shape: ShapeId; readonly at: Point }
  // Not bound to any Shape, at a point on the Sketch.
  | { readonly kind: "floating"; readonly at: Point };

/** Which end of an Arrow. */
export type EndName = "start" | "end";

/** A Shape that isn't made from a Symbol: a line between two ends. */
export type Arrow = {
  readonly id: ShapeId;
  readonly parent: ShapeId | undefined;
  readonly z: number;
  readonly style: Style;
  readonly routing: Routing;
  readonly start: ArrowEnd;
  readonly end: ArrowEnd;
  // For an elbow Arrow, how far the user dragged its middle segment from where it would be on its own.
  readonly elbowOffset?: ElbowOffset;
};

/** An Arrow but for its ID and its place among the other Shapes, such as one still being drawn. */
export type ArrowWithoutId = Omit<Arrow, "id" | "parent" | "z">;

/** Whether the Shape is an Arrow. Every other Shape is made from a Symbol. */
export function isArrow(shape: Shape): shape is Arrow {
  return "routing" in shape;
}

/** Whether the Shape is made from a Symbol, which every Shape but an Arrow is. */
export function isSymbolShape(shape: Shape): shape is SymbolShape {
  return !isArrow(shape);
}

// The Shape made from a Symbol that an end is bound to, if it is still there.
function boundShape(sketch: Sketch, id: ShapeId): SymbolShape | undefined {
  const shape = sketch.shapes[id];
  return shape && isSymbolShape(shape) ? shape : undefined;
}

// The way straight out of the side of `box` nearest to `point`. A tie goes to the side first in the order top, right,
// bottom, left.
function outOfSide(box: Bounds, point: Point): Point {
  const sides = [
    { out: { x: 0, y: -1 }, distance: point.y - box.y },
    { out: { x: 1, y: 0 }, distance: box.x + box.width - point.x },
    { out: { x: 0, y: 1 }, distance: box.y + box.height - point.y },
    { out: { x: -1, y: 0 }, distance: point.x - box.x },
  ];
  return sides.reduce((nearest, side) => (side.distance < nearest.distance ? side : nearest)).out;
}

// Where an end is on the Sketch, and for a bound end, the way out of its Shape's side it is on. `undefined` when the
// Shape it is bound to is missing.
function endLead(sketch: Sketch, end: ArrowEnd, measure: TextMeasurer): Lead | undefined {
  if (end.kind === "floating") return { point: end.at };
  const shape = boundShape(sketch, end.shape);
  if (!shape) return undefined;
  const box = displayedBounds(shape, measure);
  const { outline, ports } = shapeGeometry(shape.symbol, box);
  const point =
    end.kind === "port"
      ? ports[end.port]
      : // A point on the outline at one size need not be on it at another, so the point is brought back onto it.
        nearestOnPath(outline, { x: box.x + end.at.x * box.width, y: box.y + end.at.y * box.height });
  return point && { point, out: outOfSide(box, point) };
}

/** Where an end is on the Sketch, or `undefined` when the Shape it is bound to is missing. */
export function endPoint(sketch: Sketch, end: ArrowEnd, measure: TextMeasurer): Point | undefined {
  return endLead(sketch, end, measure)?.point;
}

/** An Arrow placed on the Sketch: where its ends are, and the points its path runs through from start to end. */
export type ResolvedArrow = {
  readonly start: Point;
  readonly end: Point;
  readonly path: readonly Point[];
  /** The middle segment of an elbow path, which can be dragged sideways, unless it has none. */
  readonly middle?: Middle;
  /** Whether the path follows the Arrow's elbow offset. It doesn't when it has none, or once it would double back. */
  readonly followsOffset: boolean;
};

/** Where an Arrow is on the Sketch, or `undefined` when an end can't be placed. */
export function resolveArrow(sketch: Sketch, arrow: ArrowWithoutId, measure: TextMeasurer): ResolvedArrow | undefined {
  const start = endLead(sketch, arrow.start, measure);
  const end = endLead(sketch, arrow.end, measure);
  if (!start || !end) return undefined;
  if (arrow.routing !== "elbow") {
    return { start: start.point, end: end.point, path: [start.point, end.point], followsOffset: false };
  }
  return { start: start.point, end: end.point, ...elbowRoute(start, end, arrow.elbowOffset) };
}

// A Shape an end can bind to, as displayed.
type Candidate = { readonly shape: SymbolShape; readonly box: Bounds; readonly geometry: ShapeGeometry };

// Of `items`, the one with the least `distanceOf`, if that is within `reach`. A tie goes to the first.
function nearestWithin<T>(items: readonly T[], distanceOf: (item: T) => number, reach: number): T | undefined {
  return items
    .map((item) => ({ item, distance: distanceOf(item) }))
    .filter(({ distance }) => distance <= reach)
    .reduce<{ item: T; distance: number } | undefined>(
      (nearest, candidate) => (nearest === undefined || candidate.distance < nearest.distance ? candidate : nearest),
      undefined,
    )?.item;
}

function outlineEnd({ shape, box }: Candidate, onOutline: Point): ArrowEnd {
  return {
    kind: "outline",
    shape: shape.id,
    at: { x: (onOutline.x - box.x) / box.width, y: (onOutline.y - box.y) / box.height },
  };
}

// Every Shape an end can bind to, as displayed, topmost first.
function candidates(sketch: Sketch, measure: TextMeasurer): readonly Candidate[] {
  return drawOrder(sketch)
    .filter(isSymbolShape)
    .toReversed()
    .map((shape) => {
      const box = displayedBounds(shape, measure);
      return { shape, box, geometry: shapeGeometry(shape.symbol, box) };
    });
}

// How close, in Sketch units, to a Shape's outline a point counts as on it, rather than inside it, so that rounding
// never hides a Port that lies on the outline of a Shape drawn above.
const onOutlineTolerance = 0.5;

// Whether `point` is hidden under the Shape: inside its outline, and not on it. Shapes are hit as if filled, so what
// they cover can't be bound to.
function hides({ box, geometry }: Candidate, point: Point): boolean {
  // Most Shapes are nowhere near the point, and the box around the outline rules them out cheaply.
  if (!contains(box, point) || !insidePath(geometry.outline, point)) return false;
  const onOutline = nearestOnPath(geometry.outline, point);
  return onOutline === undefined || distance(onOutline, point) > onOutlineTolerance;
}

/** How close, in Sketch units, an Arrow end must be to a Port to snap to it, and to an outline to bind to it. */
export type Reach = { readonly port: number; readonly outline: number };

/**
 * The end an Arrow gets when it is let go at `point`. Within `reach.port` of a Port, it snaps to the nearest such
 * Port. Otherwise, within `reach.outline` of a Shape's outline, it binds to the nearest point on the nearest such
 * outline. Anywhere else, even inside a Shape, it floats. Arrows never bind to other Arrows, nor to a Port or a point
 * on an outline that a Shape drawn above hides. A tie goes to the Shape on top.
 */
export function endLetGoAt(sketch: Sketch, point: Point, reach: Reach, measure: TextMeasurer): ArrowEnd {
  const all = candidates(sketch, measure);
  // Only what is within reach is checked for being hidden, as only that can be bound to.
  const visibleWithin = (index: number, at: Point, within: number) =>
    distance(at, point) <= within && !all.slice(0, index).some((above) => hides(above, at));
  const ports = all.flatMap((candidate, index) =>
    candidate.geometry.ports
      .map((position, port) => ({ shape: candidate.shape.id, port, position }))
      .filter(({ position }) => visibleWithin(index, position, reach.port)),
  );
  const port = nearestWithin(ports, ({ position }) => distance(position, point), reach.port);
  if (port) return { kind: "port", shape: port.shape, port: port.port };
  const outlines = all.flatMap((candidate, index) => {
    const onOutline = nearestOnPath(candidate.geometry.outline, point);
    return onOutline && visibleWithin(index, onOutline, reach.outline) ? [{ candidate, onOutline }] : [];
  });
  const near = nearestWithin(outlines, ({ onOutline }) => distance(onOutline, point), reach.outline);
  return near ? outlineEnd(near.candidate, near.onOutline) : { kind: "floating", at: point };
}

/** The Shape an end is bound to, or `undefined` when it floats. */
export function boundTo(end: ArrowEnd): ShapeId | undefined {
  return end.kind === "floating" ? undefined : end.shape;
}

/**
 * The Sketch with every Arrow end bound to one of `removed` floating where it is now, so the Arrows stay when those
 * Shapes go.
 */
export function unbindFrom(sketch: Sketch, removed: readonly ShapeId[], measure: TextMeasurer): Sketch {
  const unbind = (end: ArrowEnd): ArrowEnd => {
    const shape = boundTo(end);
    const at = shape !== undefined && removed.includes(shape) ? endPoint(sketch, end, measure) : undefined;
    return at ? { kind: "floating", at } : end;
  };
  return {
    ...sketch,
    shapes: Object.fromEntries(
      Object.entries(sketch.shapes).map(([id, shape]) => [
        id,
        isArrow(shape) ? { ...shape, start: unbind(shape.start), end: unbind(shape.end) } : shape,
      ]),
    ),
  };
}

/** The Sketch with every elbow offset dropped that its Arrow's path no longer follows, as it would double back. */
export function withoutStaleOffsets(sketch: Sketch, measure: TextMeasurer): Sketch {
  const stale = Object.values(sketch.shapes).flatMap((shape) =>
    isArrow(shape) && shape.elbowOffset && !resolveArrow(sketch, shape, measure)?.followsOffset ? [shape] : [],
  );
  if (stale.length === 0) return sketch;
  const dropped = stale.map(({ elbowOffset, ...arrow }) => [arrow.id, arrow]);
  return { ...sketch, shapes: { ...sketch.shapes, ...Object.fromEntries(dropped) } };
}
