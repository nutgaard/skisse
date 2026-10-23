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
