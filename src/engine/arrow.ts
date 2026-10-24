import type { Shape, ShapeId, Sketch, SymbolShape, TextMeasurer } from "./editor";
import { distance, type Point } from "./geometry";
import { displayedBounds } from "./label";
import { nearestOnPath } from "./path";
import { hitsOutline, shapeGeometry } from "./shape-geometry";
import type { Style } from "./style";
import { drawOrder } from "./tree";

/** How an Arrow's path runs between its ends. */
export type Routing = "straight";

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

/** Where an end is on the Sketch, or `undefined` when the Shape it is bound to is missing. */
export function endPoint(sketch: Sketch, end: ArrowEnd, measure: TextMeasurer): Point | undefined {
  if (end.kind === "floating") return end.at;
  const shape = boundShape(sketch, end.shape);
  if (!shape) return undefined;
  const box = displayedBounds(shape, measure);
  const { outline, ports } = shapeGeometry(shape.symbol, box);
  if (end.kind === "port") return ports[end.port];
  // A point on the outline at one size need not be on it at another, so the point is brought back onto it.
  return nearestOnPath(outline, { x: box.x + end.at.x * box.width, y: box.y + end.at.y * box.height });
}

/** An Arrow placed on the Sketch: where its ends are, and the points its path runs through from start to end. */
export type ResolvedArrow = { readonly start: Point; readonly end: Point; readonly path: readonly Point[] };

/** Where an Arrow is on the Sketch, or `undefined` when an end can't be placed. */
export function resolveArrow(sketch: Sketch, arrow: ArrowWithoutId, measure: TextMeasurer): ResolvedArrow | undefined {
  const start = endPoint(sketch, arrow.start, measure);
  const end = endPoint(sketch, arrow.end, measure);
  return start && end ? { start, end, path: [start, end] } : undefined;
}

// The place in `ports` of the Port nearest to `point` within `reach`, if there is one.
function portWithin(ports: readonly Point[], point: Point, reach: number): number | undefined {
  const nearest = ports
    .map((port, index) => ({ index, distance: distance(port, point) }))
    .filter((port) => port.distance <= reach)
    .sort((a, b) => a.distance - b.distance)[0];
  return nearest?.index;
}

/**
 * The Shape an Arrow end at `point` binds to: the topmost Shape under it, or with its outline or a Port within `reach`
 * of it, so an end dropped on the line drawn around a Shape binds to it. Arrows never bind to other Arrows.
 */
export function bindingTarget(
  sketch: Sketch,
  point: Point,
  reach: number,
  measure: TextMeasurer,
): SymbolShape | undefined {
  return drawOrder(sketch)
    .filter(isSymbolShape)
    .findLast((shape) => {
      const box = displayedBounds(shape, measure);
      const { outline, ports } = shapeGeometry(shape.symbol, box);
      const nearOutline = nearestOnPath(outline, point);
      return (
        hitsOutline(shape.symbol, box, point) ||
        (nearOutline !== undefined && distance(nearOutline, point) <= reach) ||
        portWithin(ports, point, reach) !== undefined
      );
    });
}

/**
 * The end an Arrow gets when it is let go at `point`. Within `reach` of a Port, it snaps to that Port. Elsewhere over
 * a Shape, it binds to the nearest point on the Shape's outline. Over empty space, it floats.
 */
export function endAt(sketch: Sketch, point: Point, reach: number, measure: TextMeasurer): ArrowEnd {
  const target = bindingTarget(sketch, point, reach, measure);
  if (!target) return { kind: "floating", at: point };
  const box = displayedBounds(target, measure);
  const { outline, ports } = shapeGeometry(target.symbol, box);
  const port = portWithin(ports, point, reach);
  if (port !== undefined) return { kind: "port", shape: target.id, port };
  const onOutline = nearestOnPath(outline, point) ?? point;
  return {
    kind: "outline",
    shape: target.id,
    at: { x: (onOutline.x - box.x) / box.width, y: (onOutline.y - box.y) / box.height },
  };
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
