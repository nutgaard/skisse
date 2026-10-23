import {
  boundsOfSpans,
  horizontalSpan,
  sideOf,
  spanAtLeast,
  spanTowards,
  verticalSpan,
  type Bounds,
  type Point,
  type Span,
} from "./geometry";

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

export function handlePositions(bounds: Bounds): readonly HandlePosition[] {
  return handles.map((handle) => ({
    handle,
    position: {
      x: bounds.x + (bounds.width * (handleDirections[handle].x + 1)) / 2,
      y: bounds.y + (bounds.height * (handleDirections[handle].y + 1)) / 2,
    },
  }));
}

export type ResizeOptions = {
  readonly snap: (value: number) => number;
  readonly keepAspectRatio: boolean;
  readonly minimumSize: number;
};

// Along one axis the handle moves: where the opposite edge stays, where the handle's edge is dragged to, and which
// side of the opposite edge the pointer is on.
type EdgeDrag = { readonly anchor: number; readonly target: number; readonly side: -1 | 1 };

// Drags the edge of `span` on the `towards` side by `delta`, snapping where it lands. The side the Shape ends up on
// comes from the unsnapped pointer, because snapping can carry the edge onto or across the opposite edge.
function dragEdge(span: Span, towards: -1 | 1, delta: number, snap: (value: number) => number): EdgeDrag {
  const anchor = towards > 0 ? span.start : span.start + span.size;
  const dragged = anchor + towards * span.size + delta;
  return { anchor, target: snap(dragged), side: sideOf(anchor, dragged, towards) };
}

// How much the drag scales a span of `size` along its axis.
function axisScale(edge: EdgeDrag, size: number): number {
  return Math.abs(edge.target - edge.anchor) / size;
}

/**
 * The Bounds after dragging `handle` by `offset`. Along each axis the handle moves, the opposite edge stays put and
 * the handle's edge follows the pointer, snapped, flipping past the opposite edge if the pointer crosses it, and
 * never closer to it than the minimum size. Keeping the aspect ratio scales by the larger change, holding the
 * opposite edge, or the middle for an axis the handle doesn't move. Scaling happens after snapping, so with the
 * aspect ratio kept the size can land off the grid.
 */
export function resizeBounds(bounds: Bounds, handle: ResizeHandle, offset: Point, options: ResizeOptions): Bounds {
  const { snap, keepAspectRatio, minimumSize } = options;
  const direction = handleDirections[handle];
  const horizontal = horizontalSpan(bounds);
  const vertical = verticalSpan(bounds);
  const horizontalEdge = direction.x === 0 ? undefined : dragEdge(horizontal, direction.x, offset.x, snap);
  const verticalEdge = direction.y === 0 ? undefined : dragEdge(vertical, direction.y, offset.y, snap);

  if (!keepAspectRatio || bounds.width === 0 || bounds.height === 0) {
    const resize = (span: Span, edge: EdgeDrag | undefined): Span =>
      edge ? spanAtLeast(edge.anchor, edge.target, edge.side, minimumSize) : span;
    return boundsOfSpans(resize(horizontal, horizontalEdge), resize(vertical, verticalEdge));
  }

  const scale = Math.max(
    ...(horizontalEdge ? [axisScale(horizontalEdge, bounds.width)] : []),
    ...(verticalEdge ? [axisScale(verticalEdge, bounds.height)] : []),
    minimumSize / bounds.width,
    minimumSize / bounds.height,
  );
  // The scale sets the size. The pointer only decides which side of the opposite edge the Shape is on.
  const scaleSpan = (span: Span, edge: EdgeDrag | undefined): Span => {
    const size = span.size * scale;
    return edge
      ? spanTowards(edge.anchor, edge.side, size)
      : { start: span.start + (span.size - size) / 2, size };
  };
  return boundsOfSpans(scaleSpan(horizontal, horizontalEdge), scaleSpan(vertical, verticalEdge));
}
