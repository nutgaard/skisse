export type Point = { readonly x: number; readonly y: number };

export type Bounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export const boundsBetween = (a: Point, b: Point): Bounds => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  width: Math.abs(b.x - a.x),
  height: Math.abs(b.y - a.y),
});

export const contains = (bounds: Bounds, point: Point): boolean =>
  point.x >= bounds.x &&
  point.x <= bounds.x + bounds.width &&
  point.y >= bounds.y &&
  point.y <= bounds.y + bounds.height;

export const containsBounds = (outer: Bounds, inner: Bounds): boolean =>
  contains(outer, inner) && contains(outer, { x: inner.x + inner.width, y: inner.y + inner.height });

export const translate = (bounds: Bounds, offset: Point): Bounds => ({
  ...bounds,
  x: bounds.x + offset.x,
  y: bounds.y + offset.y,
});

/** The smallest Bounds around all the given Bounds. Expects at least one. */
export const enclosingBounds = (all: readonly Bounds[]): Bounds =>
  boundsBetween(
    { x: Math.min(...all.map((b) => b.x)), y: Math.min(...all.map((b) => b.y)) },
    { x: Math.max(...all.map((b) => b.x + b.width)), y: Math.max(...all.map((b) => b.y + b.height)) },
  );

/** A stretch along one axis, such as a Shape's left edge and width. */
export type Span = { readonly start: number; readonly size: number };

export const horizontalSpan = (bounds: Bounds): Span => ({ start: bounds.x, size: bounds.width });

export const verticalSpan = (bounds: Bounds): Span => ({ start: bounds.y, size: bounds.height });

export const boundsOfSpans = (horizontal: Span, vertical: Span): Bounds => ({
  x: horizontal.start,
  y: vertical.start,
  width: horizontal.size,
  height: vertical.size,
});

/** Which side of `anchor` the `target` is on, or `fallback` when it is on the anchor. */
export const sideOf = (anchor: number, target: number, fallback: -1 | 1): -1 | 1 =>
  target === anchor ? fallback : target > anchor ? 1 : -1;

/** The span of `size` starting at `anchor` and running towards `side`. */
export const spanTowards = (anchor: number, side: -1 | 1, size: number): Span => ({
  start: side > 0 ? anchor : anchor - size,
  size,
});

/** The span from `anchor` to `target` on the given `side` of the anchor, at least `minimum` long. */
export const spanAtLeast = (anchor: number, target: number, side: -1 | 1, minimum: number): Span =>
  spanTowards(anchor, side, Math.max(Math.abs(target - anchor), minimum));
