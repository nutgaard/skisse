import type { Bounds, Point } from "./geometry";

/**
 * An end of an elbow path: where it is, and for an end bound to a Shape, the Shape's box as displayed and the way
 * straight out of the side of it the end is on, as a step of 1 along x or y. A floating end has no required direction.
 */
export type ElbowEnd = { readonly point: Point; readonly out?: Point; readonly box?: Bounds };

/** The axis the middle segment of an elbow path is moved along: x for an upright segment, y for a level one. */
export type Axis = "x" | "y";

/** How far the user dragged the middle segment of an elbow path from where it would be on its own. */
export type ElbowOffset = { readonly axis: Axis; readonly by: number };

/** The middle segment of an elbow path, which can be dragged sideways along its axis. */
export type MiddleSegment = {
  readonly axis: Axis;
  readonly from: Point;
  readonly to: Point;
  /** Where along the axis it is without an offset. */
  readonly natural: number;
  /** How far along the axis it can go before the path would double back at an end, exclusive. */
  readonly min: number;
  readonly max: number;
  /**
   * Where along the axis it would line up with an end that runs out a stub first, which would make the path double
   * back there.
   */
  readonly levels: readonly number[];
};

/** An elbow path, and the middle segment the user can drag sideways. */
export type ElbowRoute = {
  readonly path: readonly Point[];
  /** The middle segment, unless the path has none to drag, such as a single turn or a straight line. */
  readonly middle?: MiddleSegment;
  /** Whether the path follows the offset it was given, which it doesn't once that would make it double back. */
  readonly followsOffset: boolean;
};

// How far an elbow path runs straight out of a Shape before it turns, where it has to turn back, and how far it keeps
// from a Shape it goes around.
const stub = 20;

function along(point: Point, axis: Axis): number {
  return axis === "x" ? point.x : point.y;
}

function across(point: Point, axis: Axis): number {
  return axis === "x" ? point.y : point.x;
}

// The point at `alongAxis` along the axis and `acrossAxis` across it.
function pointAt(axis: Axis, alongAxis: number, acrossAxis: number): Point {
  return axis === "x" ? { x: alongAxis, y: acrossAxis } : { x: acrossAxis, y: alongAxis };
}

function step(point: Point, out: Point, length: number): Point {
  return { x: point.x + out.x * length, y: point.y + out.y * length };
}

// Where a box starts and ends along the axis.
type Extent = { readonly start: number; readonly end: number };

function extentOf(box: Bounds, axis: Axis): Extent {
  return axis === "x" ? { start: box.x, end: box.x + box.width } : { start: box.y, end: box.y + box.height };
}

function overlaps(a: Extent, b: Extent): boolean {
  return a.start <= b.end && b.start <= a.end;
}

// Halfway along the axis, unless that runs through a bound end's Shape, as when the ends face away from each other
// and are about level. The middle segment then goes around the Shapes there, on the side nearer halfway, or the top or
// left on a tie.
function aroundShapes(start: ElbowEnd, end: ElbowEnd, axis: Axis, halfway: number): number {
  const extents = [start, end].flatMap(({ box }) => (box ? [extentOf(box, axis)] : []));
  const hit = extents.filter((extent) => extent.start < halfway && halfway < extent.end);
  const [first] = hit;
  if (!first) return halfway;
  const span = extents
    .filter((extent) => hit.some((other) => overlaps(extent, other)))
    .reduce(
      (joined, extent) => ({ start: Math.min(joined.start, extent.start), end: Math.max(joined.end, extent.end) }),
      first,
    );
  const before = span.start - stub;
  const after = span.end + stub;
  return halfway - before <= after - halfway ? before : after;
}

// A way to route the path, with its middle segment moved along `axis`.
type Candidate = {
  readonly axis: Axis;
  // How far along the axis the middle segment can go, exclusive.
  readonly min: number;
  readonly max: number;
  // Where the middle segment goes without an offset.
  readonly natural: number;
  // Whether that is halfway between the ends.
  readonly centred: boolean;
  // How many segments the path has, before any that line up are joined.
  readonly segments: number;
};

// An end that leaves along the axis must not have the middle segment behind it, or the path would double back there.
// An end that leaves across it runs out a stub first, and turns towards the middle segment from there.
function candidate(start: ElbowEnd, end: ElbowEnd, axis: Axis): Candidate {
  const leaves = [start, end].flatMap(({ point, out }) => (out && along(out, axis) !== 0 ? [{ point, out }] : []));
  const min = Math.max(...leaves.filter(({ out }) => along(out, axis) > 0).map(({ point }) => along(point, axis)));
  const max = Math.min(...leaves.filter(({ out }) => along(out, axis) < 0).map(({ point }) => along(point, axis)));
  const halfway = (along(start.point, axis) + along(end.point, axis)) / 2;
  const centred = min < halfway && halfway < max;
  const stubs = [start, end].filter(({ out }) => out && along(out, axis) === 0).length;
  const beside = halfway <= min ? min + stub : max - stub;
  return {
    axis,
    min,
    max,
    // With nothing to keep it to one side of an end, it can go anywhere, so it keeps clear of the Shapes.
    natural: leaves.length === 0 ? aroundShapes(start, end, axis, halfway) : centred ? halfway : beside,
    centred,
    segments: 3 + stubs,
  };
}

function isPossible({ min, max }: Candidate): boolean {
  return min < max;
}

// From the end to where it meets the middle segment at `at`, running out a stub first when it leaves across the axis.
function leg({ point, out }: ElbowEnd, axis: Axis, at: number): readonly Point[] {
  if (!out || along(out, axis) !== 0) return [point, pointAt(axis, at, across(point, axis))];
  const stubEnd = step(point, out, stub);
  return [point, stubEnd, pointAt(axis, at, across(stubEnd, axis))];
}

// The path with its middle segment at `at`, before any points are joined, and where that middle segment starts and
// ends.
type Layout = { readonly points: readonly Point[]; readonly from: Point; readonly to: Point };

function layoutAt(start: ElbowEnd, end: ElbowEnd, axis: Axis, at: number): Layout {
  const fromStart = leg(start, axis, at);
  const fromEnd = leg(end, axis, at);
  return {
    points: [...fromStart, ...fromEnd.toReversed()],
    from: fromStart.at(-1) ?? start.point,
    to: fromEnd.at(-1) ?? end.point,
  };
}

// The points without any repeated one in a row.
function distinct(points: readonly Point[]): readonly Point[] {
  return points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
}

type Turn = "straight" | "turn" | "back";

// How a path through `previous`, `point` and `next` goes on at `point`: straight on, turning, or back the way it came.
function turnAt(previous: Point, point: Point, next: Point): Turn {
  const into = { x: point.x - previous.x, y: point.y - previous.y };
  const out = { x: next.x - point.x, y: next.y - point.y };
  if (into.x * out.y !== into.y * out.x) return "turn";
  return into.x * out.x + into.y * out.y > 0 ? "straight" : "back";
}

// How the path goes on at each of its points but the first and last, which are kept apart from repeated points.
function turns(points: readonly Point[]): readonly { readonly point: Point; readonly turn: Turn }[] {
  return points.slice(1, -1).flatMap((point, index) => {
    const previous = points[index];
    const next = points[index + 2];
    return previous && next ? [{ point, turn: turnAt(previous, point, next) }] : [];
  });
}

// Whether the path runs back over itself somewhere.
function turnsBack(points: readonly Point[]): boolean {
  return turns(distinct(points)).some(({ turn }) => turn === "back");
}

// Whether the straight segment from `from` to `to` runs through the inside of the box, not just along its edge.
function crosses(box: Bounds, from: Point, to: Point): boolean {
  const through = (axis: Axis) => {
    const { start, end } = extentOf(box, axis);
    const low = Math.min(along(from, axis), along(to, axis));
    const high = Math.max(along(from, axis), along(to, axis));
    return low === high ? start < low && low < end : Math.max(low, start) < Math.min(high, end);
  };
  return through("x") && through("y");
}

// Whether the path runs through the Shape of a bound end.
function crossesShapes(start: ElbowEnd, end: ElbowEnd, points: readonly Point[]): boolean {
  const boxes = [start, end].flatMap(({ box }) => (box ? [box] : []));
  return points.slice(1).some((to, index) => {
    const from = points[index] ?? to;
    return boxes.some((box) => crosses(box, from, to));
  });
}

// The path without repeated points, and without corners where it runs straight on.
function simplified(points: readonly Point[]): readonly Point[] {
  const all = distinct(points);
  const straightOn = turns(all).flatMap(({ point, turn }) => (turn === "straight" ? [point] : []));
  return all.filter((point) => !straightOn.includes(point));
}

// When the ends leave one along x and the other along y, a single turn joins them, if neither has to turn back for it.
function singleTurn(start: ElbowEnd, end: ElbowEnd): readonly Point[] | undefined {
  if (!start.out || !end.out || (start.out.x === 0) === (end.out.x === 0)) return undefined;
  const corner = start.out.x === 0 ? { x: start.point.x, y: end.point.y } : { x: end.point.x, y: start.point.y };
  const ahead = (point: Point, out: Point) => (corner.x - point.x) * out.x + (corner.y - point.y) * out.y > 0;
  return ahead(start.point, start.out) && ahead(end.point, end.out) ? [start.point, corner, end.point] : undefined;
}

// A path that doesn't run back over itself wins, then one that doesn't run through the Shapes of its ends, then the
// fewest segments, then a middle segment halfway between the ends, then one across the shorter distance, so the path
// runs mostly straight. A middle segment the user moved keeps its axis while that is still among the best.
function chosen(start: ElbowEnd, end: ElbowEnd, offset: ElbowOffset | undefined): Candidate {
  // There is always a way: when the ends rule out a middle segment on one axis, both leave along it, so the other axis
  // has stubs at both ends and nothing in the way.
  const possible = (["x", "y"] as const).map((axis) => candidate(start, end, axis)).filter(isPossible);
  const pointsOf = ({ axis, natural }: Candidate) => layoutAt(start, end, axis, natural).points;
  const forwards = possible.filter((route) => !turnsBack(pointsOf(route)));
  const clear = forwards.filter((route) => !crossesShapes(start, end, pointsOf(route)));
  const pool = [clear, forwards, possible].find((routes) => routes.length > 0) ?? possible;
  const fewest = Math.min(...pool.map(({ segments }) => segments));
  const best = pool.filter(({ segments }) => segments === fewest);
  const kept = best.find(({ axis }) => axis === offset?.axis);
  if (kept) return kept;
  const wide = Math.abs(end.point.x - start.point.x) >= Math.abs(end.point.y - start.point.y);
  const rank = ({ centred, axis }: Candidate) => (centred ? 2 : 0) + ((axis === "x") === wide ? 1 : 0);
  return best.reduce((winner, other) => (rank(other) > rank(winner) ? other : winner));
}

/**
 * An orthogonal path from `start` to `end`. It leaves and enters each bound end at right angles to the side it is on,
 * and has one middle segment, moved by `offset` along its axis unless that would make the path double back. Ends that
 * can be joined by a single turn are, with no middle segment.
 */
export function elbowRoute(start: ElbowEnd, end: ElbowEnd, offset: ElbowOffset | undefined): ElbowRoute {
  const turn = singleTurn(start, end);
  if (turn) return { path: turn, followsOffset: false };
  const { axis, natural, min, max } = chosen(start, end, offset);
  const levels = [start, end].flatMap(({ point, out }) => (out && along(out, axis) === 0 ? [along(point, axis)] : []));
  const moved = offset?.axis === axis ? natural + offset.by : undefined;
  const followsOffset =
    moved !== undefined && min < moved && moved < max && !turnsBack(layoutAt(start, end, axis, moved).points);
  const { points, from, to } = layoutAt(start, end, axis, followsOffset ? moved : natural);
  const hasMiddle = from.x !== to.x || from.y !== to.y;
  return {
    path: simplified(points),
    ...(hasMiddle ? { middle: { axis, from, to, natural, min, max, levels } } : {}),
    followsOffset,
  };
}

// How short dragging the middle segment can make the segments joining it to the ends, so it never reaches an end, nor
// lines up with one.
const shortestEnd = 10;

/**
 * The offset that moves `middle` by how far it was dragged, `moved`, along its axis, as far as it can go while the
 * segments joining it to the ends stay at least `shortestEnd` long. Where it would line up with an end, it stops short
 * of it, on the nearer side. `undefined` when that leaves it where it is on its own.
 */
export function offsetDraggedBy(middle: MiddleSegment, moved: Point): ElbowOffset | undefined {
  const { axis, natural, min, max, levels } = middle;
  const lowest = min + shortestEnd;
  const highest = max - shortestEnd;
  const wanted = along(middle.from, axis) + along(moved, axis);
  const clamped = lowest > highest ? natural : Math.min(highest, Math.max(lowest, wanted));
  const at = levels.toSorted((a, b) => a - b).reduce((placed, level) => {
    if (Math.abs(placed - level) >= shortestEnd) return placed;
    return placed < level ? level - shortestEnd : level + shortestEnd;
  }, clamped);
  return at === natural ? undefined : { axis, by: at - natural };
}
