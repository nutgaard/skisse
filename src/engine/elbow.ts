import type { Point } from "./geometry";

/**
 * An end of an elbow path: where it is, and for an end bound to a Shape, the way straight out of the side of the Shape
 * it is on, as a step of 1 along x or y. A floating end has no required direction.
 */
export type Lead = { readonly point: Point; readonly out?: Point };

/** The axis the middle segment of an elbow path is moved along: x for an upright segment, y for a level one. */
export type Axis = "x" | "y";

/** How far the user dragged the middle segment of an elbow path from where it would be on its own. */
export type ElbowOffset = { readonly axis: Axis; readonly by: number };

/** The middle segment of an elbow path, which can be dragged sideways along its axis. */
export type Middle = {
  readonly axis: Axis;
  readonly from: Point;
  readonly to: Point;
  /** Where along the axis it is without an offset. */
  readonly natural: number;
  /** How far along the axis it can go before the path would double back at an end, exclusive. */
  readonly min: number;
  readonly max: number;
};

export type ElbowRoute = {
  readonly path: readonly Point[];
  /** The middle segment, unless the path has none to drag, such as a single turn or a straight line. */
  readonly middle?: Middle;
  /** Whether the path follows the offset it was given, which it doesn't once that would make it double back. */
  readonly followsOffset: boolean;
};

// How far an elbow path runs straight out of a Shape before it turns, where it has to turn back.
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
function candidate(start: Lead, end: Lead, axis: Axis): Candidate {
  const leaves = [start, end].flatMap(({ point, out }) => (out && along(out, axis) !== 0 ? [{ point, out }] : []));
  const min = Math.max(...leaves.filter(({ out }) => along(out, axis) > 0).map(({ point }) => along(point, axis)));
  const max = Math.min(...leaves.filter(({ out }) => along(out, axis) < 0).map(({ point }) => along(point, axis)));
  const halfway = (along(start.point, axis) + along(end.point, axis)) / 2;
  const centred = min < halfway && halfway < max;
  const stubs = [start, end].filter(({ out }) => out && along(out, axis) === 0).length;
  return {
    axis,
    min,
    max,
    natural: centred ? halfway : halfway <= min ? min + stub : max - stub,
    centred,
    segments: 3 + stubs,
  };
}

function isPossible({ min, max }: Candidate): boolean {
  return min < max;
}

// From the end to where it meets the middle segment at `at`, running out a stub first when it leaves across the axis.
function lead({ point, out }: Lead, axis: Axis, at: number): readonly Point[] {
  if (!out || along(out, axis) !== 0) return [point, pointAt(axis, at, across(point, axis))];
  const stubEnd = step(point, out, stub);
  return [point, stubEnd, pointAt(axis, at, across(stubEnd, axis))];
}

// Whether a path through `previous`, `point` and `next` runs straight on at `point`, neither turning nor turning back.
function runsStraightOn(previous: Point, point: Point, next: Point): boolean {
  const into = { x: point.x - previous.x, y: point.y - previous.y };
  const out = { x: next.x - point.x, y: next.y - point.y };
  return into.x * out.y === into.y * out.x && into.x * out.x + into.y * out.y > 0;
}

// The path without repeated points, and without corners where it runs on straight. A turn back is kept.
function simplified(points: readonly Point[]): readonly Point[] {
  const distinct = points.filter((point, index) => {
    const previous = points[index - 1];
    return !previous || previous.x !== point.x || previous.y !== point.y;
  });
  return distinct.filter((point, index) => {
    const previous = distinct[index - 1];
    const next = distinct[index + 1];
    return !previous || !next || !runsStraightOn(previous, point, next);
  });
}

// When the ends leave one along x and the other along y, a single turn joins them, if neither has to turn back for it.
function singleTurn(start: Lead, end: Lead): readonly Point[] | undefined {
  if (!start.out || !end.out || (start.out.x === 0) === (end.out.x === 0)) return undefined;
  const corner = start.out.x === 0 ? { x: start.point.x, y: end.point.y } : { x: end.point.x, y: start.point.y };
  const ahead = (point: Point, out: Point) => (corner.x - point.x) * out.x + (corner.y - point.y) * out.y > 0;
  return ahead(start.point, start.out) && ahead(end.point, end.out) ? [start.point, corner, end.point] : undefined;
}

// The fewest segments wins, then a middle segment halfway between the ends, then one across the shorter distance, so
// the path runs mostly straight. A middle segment the user moved keeps its axis while that is still among the best.
function chosen(start: Lead, end: Lead, offset: ElbowOffset | undefined): Candidate {
  const possible = (["x", "y"] as const).map((axis) => candidate(start, end, axis)).filter(isPossible);
  const fewest = Math.min(...possible.map(({ segments }) => segments));
  const best = possible.filter(({ segments }) => segments === fewest);
  const kept = best.find(({ axis }) => axis === offset?.axis);
  if (kept) return kept;
  const wide = Math.abs(end.point.x - start.point.x) >= Math.abs(end.point.y - start.point.y);
  const rank = ({ centred, axis }: Candidate) => (centred ? 2 : 0) + ((axis === "x") === wide ? 1 : 0);
  // There is always a way: when the ends rule out a middle segment on one axis, both leave along it, so the other axis
  // has stubs at both ends and nothing in the way.
  return best.reduce((winner, other) => (rank(other) > rank(winner) ? other : winner));
}

/**
 * An orthogonal path from `start` to `end`. It leaves and enters each bound end at right angles to the side it is on,
 * and has one middle segment, moved by `offset` along its axis unless that would make the path double back at an end.
 * Ends that can be joined by a single turn are, with no middle segment.
 */
export function elbowRoute(start: Lead, end: Lead, offset: ElbowOffset | undefined): ElbowRoute {
  const turn = singleTurn(start, end);
  if (turn) return { path: turn, followsOffset: false };
  const route = chosen(start, end, offset);
  const { axis, natural, min, max } = route;
  const moved = offset?.axis === axis ? natural + offset.by : undefined;
  const followsOffset = moved !== undefined && min < moved && moved < max;
  const at = followsOffset ? moved : natural;
  const fromStart = lead(start, axis, at);
  const fromEnd = lead(end, axis, at);
  const from = fromStart.at(-1) ?? start.point;
  const to = fromEnd.at(-1) ?? end.point;
  const path = simplified([...fromStart, ...fromEnd.toReversed()]);
  const hasMiddle = from.x !== to.x || from.y !== to.y;
  return { path, ...(hasMiddle ? { middle: { axis, from, to, natural, min, max } } : {}), followsOffset };
}

// How short dragging the middle segment can make the segment at either end, so the middle segment never reaches an end.
const shortestEnd = 10;

/**
 * The offset that moves `middle` by how far it was dragged, `moved`, along its axis, as far as it can go while the
 * segments at both ends stay at least `shortestEnd` long. `undefined` when that leaves it where it is on its own.
 */
export function offsetDraggedBy(middle: Middle, moved: Point): ElbowOffset | undefined {
  const { axis, natural, min, max } = middle;
  const lowest = min + shortestEnd;
  const highest = max - shortestEnd;
  const wanted = along(middle.from, axis) + along(moved, axis);
  const at = lowest > highest ? natural : Math.min(highest, Math.max(lowest, wanted));
  return at === natural ? undefined : { axis, by: at - natural };
}
