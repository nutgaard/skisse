import type { Bounds, Point } from "./geometry";

/** A resize handle, named by compass direction: the corners and the middle of each side. */
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const handles: readonly Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

export const handlePositions = (bounds: Bounds): readonly { readonly handle: Handle; readonly position: Point }[] =>
  handles.map((handle) => ({
    handle,
    position: {
      x: bounds.x + bounds.width * (handle.includes("w") ? 0 : handle.includes("e") ? 1 : 0.5),
      y: bounds.y + bounds.height * (handle.includes("n") ? 0 : handle.includes("s") ? 1 : 0.5),
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
 * by the larger change, holding the opposite edge, or the middle for an axis the handle doesn't move.
 */
export const resizeBounds = (bounds: Bounds, handle: Handle, offset: Point, options: ResizeOptions): Bounds => {
  const { snap, keepAspectRatio, minimumSize } = options;
  const right = bounds.x + bounds.width;
  const bottom = bounds.y + bounds.height;
  const movesLeft = handle.includes("w");
  const movesRight = handle.includes("e");
  const movesTop = handle.includes("n");
  const movesBottom = handle.includes("s");

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
