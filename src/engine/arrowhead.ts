import type { Arrowhead } from "./arrow";
import { distance, type Point } from "./geometry";
import { polygon, polyline, type Path } from "./path";
import { strokePixels, type StrokeWidth } from "./style";

/** An arrowhead as drawn: lines, filled or not, or a filled circle. */
export type ArrowheadGeometry =
  | { readonly kind: "lines"; readonly path: Path; readonly filled: boolean }
  | { readonly kind: "circle"; readonly center: Point; readonly radius: number };

/** How long, in Sketch units, an arrowhead is along the line, for each stroke width. It is half as wide across it. */
export function arrowheadLength(width: StrokeWidth): number {
  return 8 + 2 * strokePixels[width];
}

/** How far back along the line from its end the head reaches, as drawn by `arrowheadAt` at `length`. */
export function arrowheadReach(head: Arrowhead, length: number): number {
  switch (head) {
    case "none":
      return 0;
    case "diamond":
      return 2 * length;
    case "arrow":
    case "openArrow":
    case "circle":
      return length;
  }
}

/**
 * The head at the last of `points`, lined up with the line running into it, `length` long along the line and half as
 * wide across it. `undefined` for no head, or when the line has no length to give it a direction.
 */
export function arrowheadAt(head: Arrowhead, points: readonly Point[], length: number): ArrowheadGeometry | undefined {
  const tip = points.at(-1);
  // An elbow path can run through the same point twice, which gives no direction.
  const from = tip && points.findLast((point) => distance(point, tip) > 0);
  if (head === "none" || !tip || !from) return undefined;
  const along = distance(from, tip);
  const forward = { x: (tip.x - from.x) / along, y: (tip.y - from.y) / along };
  const across = { x: forward.y, y: -forward.x };
  const at = (back: number, side: number): Point => ({
    x: tip.x - forward.x * back + across.x * side,
    y: tip.y - forward.y * back + across.y * side,
  });
  const width = length / 2;
  switch (head) {
    case "arrow":
      return { kind: "lines", path: polygon([tip, at(length, width), at(length, -width)]), filled: true };
    case "openArrow":
      return { kind: "lines", path: polyline([at(length, width), tip, at(length, -width)]), filled: false };
    case "diamond":
      return {
        kind: "lines",
        path: polygon([tip, at(length, width), at(2 * length, 0), at(length, -width)]),
        filled: true,
      };
    case "circle":
      return { kind: "circle", center: at(length / 2, 0), radius: length / 2 };
  }
}
