import type { ShapeId, Sketch, SymbolShape, TextMeasurer } from "./editor";
import { arrowheadLength, arrowheadReach } from "./arrowhead";
import { elbowRoute, type ElbowEnd, type ElbowOffset, type MiddleSegment } from "./elbow";
import {
  contains,
  distance,
  distanceBetweenBounds,
  distanceToBounds,
  translate,
  type Bounds,
  type Point,
} from "./geometry";
import { arrowLabelLayout, displayedBounds, type ArrowLabelLayout } from "./label";
import { insidePath, nearestOnPath, pointAlongPolyline, polylineLength } from "./path";
import { shapeGeometry, type ShapeGeometry } from "./shape-geometry";
import { isArrow, isSymbolShape } from "./shape-kind";
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

/** The heads an Arrow end can have, in the order the style panel shows them. */
export const arrowheads = ["none", "arrow", "openArrow", "diamond", "circle"] as const;

/** What an Arrow end shows: nothing, or a head of some kind. */
export type Arrowhead = (typeof arrowheads)[number];

/** The head at each end of an Arrow. */
export type EndHeads = Readonly<Record<EndName, Arrowhead>>;

/** The heads of Arrows until others are chosen: none at the start, and an arrow at the end. */
export const defaultHeads: EndHeads = { start: "none", end: "arrow" };

/** An Arrow's Label: its text, and where it sits along the Arrow's path, as a share of the path's length. */
export type ArrowLabel = { readonly text: string; readonly along: number };

/** The Label of a new Arrow: empty, and halfway along. */
export const newArrowLabel: ArrowLabel = { text: "", along: 0.5 };

/** A Shape that isn't made from a Symbol: a line between two ends. */
export type Arrow = {
  readonly id: ShapeId;
  readonly parent: ShapeId | undefined;
  readonly z: number;
  readonly style: Style;
  readonly routing: Routing;
  readonly start: ArrowEnd;
  readonly end: ArrowEnd;
  readonly heads: EndHeads;
  readonly label: ArrowLabel;
  // For an elbow Arrow, how far the user dragged its middle segment from where it would be on its own.
  readonly elbowOffset?: ElbowOffset;
};

/** An Arrow but for its ID and its place among the other Shapes, such as one still being drawn. */
export type ArrowWithoutId = Omit<Arrow, "id" | "parent" | "z">;

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

// Where an end is on the Sketch, and for a bound end, its Shape's box as displayed and the way out of the side of it
// the end is on. `undefined` when the Shape it is bound to is missing.
function elbowEnd(sketch: Sketch, end: ArrowEnd, measure: TextMeasurer): ElbowEnd | undefined {
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
  return point && { point, out: outOfSide(box, point), box };
}

/** Where an end is on the Sketch, or `undefined` when the Shape it is bound to is missing. */
export function endPoint(sketch: Sketch, end: ArrowEnd, measure: TextMeasurer): Point | undefined {
  return elbowEnd(sketch, end, measure)?.point;
}

/** An Arrow placed on the Sketch: where its ends are, and the points its path runs through from start to end. */
export type ResolvedArrow = {
  readonly start: Point;
  readonly end: Point;
  readonly path: readonly Point[];
  /** The middle segment of an elbow path, which can be dragged sideways, unless it has none. */
  readonly middle?: MiddleSegment;
  /** Whether the path follows the Arrow's elbow offset. It doesn't when it has none, or once it would double back. */
  readonly followsOffset: boolean;
  /** The Bounds, as displayed, of the Shapes the Arrow's ends are bound to. */
  readonly boundBoxes: readonly Bounds[];
};

/** Where an Arrow is on the Sketch, or `undefined` when an end can't be placed. */
export function resolveArrow(sketch: Sketch, arrow: ArrowWithoutId, measure: TextMeasurer): ResolvedArrow | undefined {
  const start = elbowEnd(sketch, arrow.start, measure);
  const end = elbowEnd(sketch, arrow.end, measure);
  if (!start || !end) return undefined;
  const boundBoxes = [start.box, end.box].filter((box) => box !== undefined);
  const placed = { start: start.point, end: end.point, boundBoxes };
  if (arrow.routing !== "elbow") return { ...placed, path: [start.point, end.point], followsOffset: false };
  return { ...placed, ...elbowRoute(start, end, arrow.elbowOffset) };
}

// How much of the line, in Sketch units, shows at least between the gap around an Arrow's Label and each end, past the
// head there, and between the gap and the Shapes the ends are bound to, so the Label stays clear of the heads, the
// Ports and the Shapes.
const lineBesideLabel = 12;

// How close the gap around the Arrow's Label may come to its `end`.
function labelClearance(arrow: ArrowWithoutId, end: EndName): number {
  return arrowheadReach(arrow.heads[end], arrowheadLength(arrow.style.strokeWidth)) + lineBesideLabel;
}

/**
 * Where along the Arrow's path, as a share of its length, its Label is shown when it is put at `along`: there, or else
 * at the nearest share where the gap around it keeps clear of both ends, their heads, and the Shapes they are bound to.
 * `undefined` when there is no room for that anywhere, such as on an Arrow too short for the Label.
 */
export function clearAlong(
  arrow: ArrowWithoutId,
  resolved: ResolvedArrow,
  along: number,
  measure: TextMeasurer,
): number | undefined {
  const { gap } = arrowLabelLayout(arrow.label.text, arrow.style.fontSize, { x: 0, y: 0 }, measure);
  const total = polylineLength(resolved.path);
  if (!gap || total === 0) return along;
  const fromStart = labelClearance(arrow, "start");
  const fromEnd = labelClearance(arrow, "end");
  // The gap reaches at least half its smaller side from the point it is centred on, so on a path shorter than this,
  // it can't keep clear of both ends anywhere.
  if (total < fromStart + fromEnd + Math.min(gap.width, gap.height)) return undefined;
  const clear = (length: number) => {
    const around = translate(gap, pointAlongPolyline(resolved.path, length / total) ?? resolved.start);
    return (
      distanceToBounds(around, resolved.start) >= fromStart &&
      distanceToBounds(around, resolved.end) >= fromEnd &&
      resolved.boundBoxes.every((box) => distanceBetweenBounds(around, box) >= lineBesideLabel)
    );
  };
  // Nearest first: where it was put, and then one Sketch unit further either way at a time, stopping at the first clear
  // place found.
  const wanted = Math.max(0, Math.min(1, along)) * total;
  const clearAt = (step: number) =>
    (step === 0 ? [wanted] : [wanted - step, wanted + step]).find(
      (length) => length >= 0 && length <= total && clear(length),
    );
  const step = Array.from({ length: Math.ceil(total) + 1 }, (_, index) => index).find(
    (candidate) => clearAt(candidate) !== undefined,
  );
  const found = step === undefined ? undefined : clearAt(step);
  return found === undefined ? undefined : found / total;
}

/**
 * The Arrow's Label as displayed on its path as resolved: at its share, or as near to it as keeps it clear of the ends,
 * or in the middle when nowhere does.
 */
export function layoutArrowLabel(
  arrow: ArrowWithoutId,
  resolved: ResolvedArrow,
  measure: TextMeasurer,
): ArrowLabelLayout {
  const along = clearAlong(arrow, resolved, arrow.label.along, measure) ?? 0.5;
  const at = pointAlongPolyline(resolved.path, along) ?? resolved.start;
  return arrowLabelLayout(arrow.label.text, arrow.style.fontSize, at, measure);
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

/** The Arrows with an end bound to one of `ids`. */
export function arrowsBoundTo(sketch: Sketch, ids: readonly ShapeId[]): readonly ShapeId[] {
  const boundToOne = (end: ArrowEnd) => {
    const shape = boundTo(end);
    return shape !== undefined && ids.includes(shape);
  };
  return Object.values(sketch.shapes)
    .filter((shape) => isArrow(shape) && (boundToOne(shape.start) || boundToOne(shape.end)))
    .map(({ id }) => id);
}

/** The end floating where it is now, or as it is when it floats already or the Shape it is bound to is missing. */
export function floatedInPlace(sketch: Sketch, end: ArrowEnd, measure: TextMeasurer): ArrowEnd {
  const at = end.kind === "floating" ? undefined : endPoint(sketch, end, measure);
  return at ? { kind: "floating", at } : end;
}

/**
 * The Sketch with every Arrow end bound to one of `removed` floating where it is now, so the Arrows stay when those
 * Shapes go.
 */
export function unbindFrom(sketch: Sketch, removed: readonly ShapeId[], measure: TextMeasurer): Sketch {
  const unbind = (end: ArrowEnd): ArrowEnd => {
    const shape = boundTo(end);
    return shape !== undefined && removed.includes(shape) ? floatedInPlace(sketch, end, measure) : end;
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

/** The Arrow without an elbow offset, its middle segment back where it is on its own. */
export function withoutOffset(arrow: Arrow): Arrow {
  const { elbowOffset, ...rest } = arrow;
  return rest;
}

/** The Sketch with every elbow offset dropped that its Arrow's path no longer follows, as it would double back. */
export function withoutStaleOffsets(sketch: Sketch, measure: TextMeasurer): Sketch {
  const stale = Object.values(sketch.shapes).flatMap((shape) =>
    isArrow(shape) && shape.elbowOffset && !resolveArrow(sketch, shape, measure)?.followsOffset ? [shape] : [],
  );
  if (stale.length === 0) return sketch;
  const dropped = stale.map((arrow) => [arrow.id, withoutOffset(arrow)]);
  return { ...sketch, shapes: { ...sketch.shapes, ...Object.fromEntries(dropped) } };
}
