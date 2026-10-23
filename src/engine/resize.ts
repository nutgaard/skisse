import { spanFrom, type Bounds, type Point, type Span } from "./geometry";

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

// Along one axis the handle moves: where the opposite edge stays, and where the handle's edge is dragged to.
type EdgeDrag = { readonly anchor: number; readonly target: number; readonly towards: -1 | 1 };

const dragEdge = (span: Span, towards: -1 | 1, delta: number, snap: (value: number) => number): EdgeDrag => {
  const anchor = towards > 0 ? span.start : span.start + span.size;
  return { anchor, target: snap(anchor + towards * span.size + delta), towards };
};

const dragRatio = (edge: EdgeDrag, size: number): number => Math.abs(edge.target - edge.anchor) / size;

/**
 * The Bounds after dragging `handle` by `offset`. Along each axis the handle moves, the opposite edge stays put and
 * the handle's edge follows the pointer, snapped, flipping past the opposite edge if the pointer crosses it, and
 * never closer to it than the minimum size. Keeping the aspect ratio scales by the larger change, holding the
 * opposite edge, or the middle for an axis the handle doesn't move. Scaling happens after snapping, so with the
 * aspect ratio kept the size can land off the grid.
 */
export const resizeBounds = (bounds: Bounds, handle: ResizeHandle, offset: Point, options: ResizeOptions): Bounds => {
  const { snap, keepAspectRatio, minimumSize } = options;
  const direction = handleDirections[handle];
  const horizontalSpan = { start: bounds.x, size: bounds.width };
  const verticalSpan = { start: bounds.y, size: bounds.height };
  const horizontal = direction.x === 0 ? undefined : dragEdge(horizontalSpan, direction.x, offset.x, snap);
  const vertical = direction.y === 0 ? undefined : dragEdge(verticalSpan, direction.y, offset.y, snap);

  const keepsRatio = keepAspectRatio && bounds.width > 0 && bounds.height > 0;
  const scale = keepsRatio
    ? Math.max(
        ...(horizontal ? [dragRatio(horizontal, bounds.width)] : []),
        ...(vertical ? [dragRatio(vertical, bounds.height)] : []),
        minimumSize / bounds.width,
        minimumSize / bounds.height,
      )
    : 1;

  const resize = (span: Span, edge: EdgeDrag | undefined): Span => {
    if (edge) return spanFrom(edge.anchor, edge.target, keepsRatio ? span.size * scale : minimumSize, edge.towards);
    return { start: span.start + (span.size - span.size * scale) / 2, size: span.size * scale };
  };
  const x = resize(horizontalSpan, horizontal);
  const y = resize(verticalSpan, vertical);
  return { x: x.start, y: y.start, width: x.size, height: y.size };
};
