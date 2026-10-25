export type Point = { readonly x: number; readonly y: number };

export type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** The straight-line distance between two points. */
export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** How far `point` is from the nearest point of `bounds`, or 0 when it is inside them. */
export function distanceToBounds(bounds: Bounds, point: Point): number {
  const dx = Math.max(bounds.x - point.x, 0, point.x - (bounds.x + bounds.width));
  const dy = Math.max(bounds.y - point.y, 0, point.y - (bounds.y + bounds.height));
  return Math.hypot(dx, dy);
}

/** How far apart `a` and `b` are at their nearest, or 0 when they overlap. */
export function distanceBetweenBounds(a: Bounds, b: Bounds): number {
  const dx = Math.max(a.x - (b.x + b.width), 0, b.x - (a.x + a.width));
  const dy = Math.max(a.y - (b.y + b.height), 0, b.y - (a.y + a.height));
  return Math.hypot(dx, dy);
}

/** The smallest Bounds around `points`. Expects at least one point. */
export function boundsOfPoints(points: readonly Point[]): Bounds {
  return boundsBetween(
    { x: Math.min(...points.map(({ x }) => x)), y: Math.min(...points.map(({ y }) => y)) },
    { x: Math.max(...points.map(({ x }) => x)), y: Math.max(...points.map(({ y }) => y)) },
  );
}

export function boundsBetween(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(b.x - a.x),
    height: Math.abs(b.y - a.y),
  };
}

export function contains(bounds: Bounds, point: Point): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function containsBounds(outer: Bounds, inner: Bounds): boolean {
  return contains(outer, inner) && contains(outer, { x: inner.x + inner.width, y: inner.y + inner.height });
}

export function samePoint(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export function sameBounds(a: Bounds, b: Bounds): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

export function translate(bounds: Bounds, offset: Point): Bounds {
  return {
    ...bounds,
    x: bounds.x + offset.x,
    y: bounds.y + offset.y,
  };
}

/** The smallest Bounds around all the given Bounds. Expects at least one. */
export function enclosingBounds(all: readonly Bounds[]): Bounds {
  return boundsBetween(
    { x: Math.min(...all.map((b) => b.x)), y: Math.min(...all.map((b) => b.y)) },
    { x: Math.max(...all.map((b) => b.x + b.width)), y: Math.max(...all.map((b) => b.y + b.height)) },
  );
}

/** `bounds` grown by `margin` on every side. */
export function expandBounds({ x, y, width, height }: Bounds, margin: number): Bounds {
  return {
    x: x - margin,
    y: y - margin,
    width: width + margin * 2,
    height: height + margin * 2,
  };
}

/** A stretch along one axis, such as a Shape's left edge and width. */
export type Span = { readonly start: number; readonly size: number };

export function horizontalSpan(bounds: Bounds): Span {
  return { start: bounds.x, size: bounds.width };
}

export function verticalSpan(bounds: Bounds): Span {
  return { start: bounds.y, size: bounds.height };
}

export function boundsOfSpans(horizontal: Span, vertical: Span): Bounds {
  return {
    x: horizontal.start,
    y: vertical.start,
    width: horizontal.size,
    height: vertical.size,
  };
}

/** Which side of `anchor` the `target` is on, or `fallback` when it is on the anchor. */
export function sideOf(anchor: number, target: number, fallback: -1 | 1): -1 | 1 {
  return target === anchor ? fallback : target > anchor ? 1 : -1;
}

/** The span of `size` starting at `anchor` and running towards `side`. */
export function spanTowards(anchor: number, side: -1 | 1, size: number): Span {
  return {
    start: side > 0 ? anchor : anchor - size,
    size,
  };
}

/** The span from `anchor` to `target` on the given `side` of the anchor, at least `minimum` long. */
export function spanAtLeast(anchor: number, target: number, side: -1 | 1, minimum: number): Span {
  return spanTowards(anchor, side, Math.max(Math.abs(target - anchor), minimum));
}
