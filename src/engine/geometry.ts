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

/**
 * The span from `anchor` towards `target`, at least `minimum` long. It flips to the other side of the anchor when
 * the target is there, and a target on the anchor spans in `fallbackDirection`.
 */
export const spanFrom = (
  anchor: number,
  target: number,
  minimum: number,
  fallbackDirection: -1 | 1 = 1,
): Span => {
  const direction = target === anchor ? fallbackDirection : Math.sign(target - anchor);
  const size = Math.max(Math.abs(target - anchor), minimum);
  return { start: direction > 0 ? anchor : anchor - size, size };
};

/** The Bounds from `anchor` towards `target`, at least `minimum` wide and high. */
export const boundsFrom = (anchor: Point, target: Point, minimum: number): Bounds => {
  const horizontal = spanFrom(anchor.x, target.x, minimum);
  const vertical = spanFrom(anchor.y, target.y, minimum);
  return { x: horizontal.start, y: vertical.start, width: horizontal.size, height: vertical.size };
};
