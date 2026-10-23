import type { Bounds, Point } from "./geometry";

/** A resize handle, named by compass direction: the corners and the middle of each side. */
export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

type Direction = -1 | 0 | 1;

// Which edges each handle moves: -1 the left or top edge, 1 the right or bottom edge, 0 neither.
const handleDirections: Readonly<Record<ResizeHandle, { readonly x: Direction; readonly y: Direction }>> = {
  nw: { x: -1, y: -1 },
  n: { x: 0, y: -1 },
  ne: { x: 1, y: -1 },
  e: { x: 1, y: 0 },
  se: { x: 1, y: 1 },
  s: { x: 0, y: 1 },
  sw: { x: -1, y: 1 },
  w: { x: -1, y: 0 },
};

const handles: readonly ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export type HandlePosition = { readonly handle: ResizeHandle; readonly position: Point };

export const handlePositions = (bounds: Bounds): readonly HandlePosition[] =>
  handles.map((handle) => ({
    handle,
    position: {
      x: bounds.x + (bounds.width * (handleDirections[handle].x + 1)) / 2,
      y: bounds.y + (bounds.height * (handleDirections[handle].y + 1)) / 2,
    },
  }));

export type ResizeOptions = {
  readonly snap: (value: number) => number;
  readonly keepAspectRatio: boolean;
  readonly minimumSize: number;
};

/**
 * The Bounds after dragging `handle` by `offset`. Only the handle's own edges move, each snapped on its own,
 * and they stop at the minimum size instead of crossing the opposite edge. Keeping the aspect ratio scales
 * by the larger change, holding the opposite edge, or the middle for an axis the handle doesn't move. Scaling
 * happens after snapping, so with the aspect ratio kept the size can land off the grid.
 */
export const resizeBounds = (bounds: Bounds, handle: ResizeHandle, offset: Point, options: ResizeOptions): Bounds => {
  const { snap, keepAspectRatio, minimumSize } = options;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const direction = handleDirections[handle];
  const movesLeft = direction.x === -1;
  const movesRight = direction.x === 1;
  const movesTop = direction.y === -1;
  const movesBottom = direction.y === 1;

  const newLeft = movesLeft ? Math.min(snap(bounds.x + offset.x), right - minimumSize) : bounds.x;
  const newRight = movesRight ? Math.max(snap(right + offset.x), bounds.x + minimumSize) : right;
  const newTop = movesTop ? Math.min(snap(bounds.y + offset.y), bottom - minimumSize) : bounds.y;
  const newBottom = movesBottom ? Math.max(snap(bottom + offset.y), bounds.y + minimumSize) : bottom;

  if (!keepAspectRatio || bounds.width === 0 || bounds.height === 0) {
    return { x: newLeft, y: newTop, width: newRight - newLeft, height: newBottom - newTop };
  }

  const scale = Math.max(
    ...(movesLeft || movesRight ? [(newRight - newLeft) / bounds.width] : []),
    ...(movesTop || movesBottom ? [(newBottom - newTop) / bounds.height] : []),
    minimumSize / bounds.width,
    minimumSize / bounds.height,
  );
  const width = bounds.width * scale;
  const height = bounds.height * scale;
  return {
    x: movesLeft ? right - width : movesRight ? bounds.x : bounds.x + (bounds.width - width) / 2,
    y: movesTop ? bottom - height : movesBottom ? bounds.y : bounds.y + (bounds.height - height) / 2,
    width,
    height,
  };
};
