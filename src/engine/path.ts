import type { Bounds, Point } from "./geometry";

/**
 * One step of a Path, in Sketch coordinates. A `move` starts a new piece, and `close` joins a piece back to its start.
 */
export type PathCommand =
  | { readonly type: "move"; readonly to: Point }
  | { readonly type: "line"; readonly to: Point }
  | { readonly type: "cubic"; readonly control1: Point; readonly control2: Point; readonly to: Point }
  | { readonly type: "close" };

/** Lines and curves, such as a Symbol's outline. Kept as data, so the view decides how they are drawn. */
export type Path = readonly PathCommand[];

export function moveTo(to: Point): PathCommand {
  return { type: "move", to };
}

export function lineTo(to: Point): PathCommand {
  return { type: "line", to };
}

export const close: PathCommand = { type: "close" };

/** A closed piece through `points`, joined by straight lines. */
export function polygon(points: readonly Point[]): Path {
  return [
    ...points.flatMap((point, index) => (index === 0 ? [moveTo(point)] : [lineTo(point)])),
    close,
  ];
}

export function rectangle({ x, y, width, height }: Bounds): Path {
  return polygon([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]);
}

/**
 * Curves along the ellipse around `center` with radii `rx` and `ry`, from angle `from` to angle `to`, in radians. Angle
 * 0 points right and angles grow clockwise on screen. The Path is expected to be at the start of the arc already.
 */
export function arc(center: Point, rx: number, ry: number, from: number, to: number): Path {
  // A cubic curve follows a circle closely for up to a quarter turn, so longer arcs are split.
  const pieces = Math.max(1, Math.ceil(Math.abs(to - from) / (Math.PI / 2) - 1e-9));
  const step = (to - from) / pieces;
  const handle = (4 / 3) * Math.tan(step / 4);
  const at = (angle: number, along: number): Point => ({
    x: center.x + rx * (Math.cos(angle) - along * Math.sin(angle)),
    y: center.y + ry * (Math.sin(angle) + along * Math.cos(angle)),
  });
  return Array.from({ length: pieces }, (_, index) => {
    const start = from + step * index;
    const end = start + step;
    return { type: "cubic", control1: at(start, handle), control2: at(end, -handle), to: at(end, 0) };
  });
}

// The point on the ellipse around `center` at `angle`, as for `arc`.
function pointOnEllipse(center: Point, rx: number, ry: number, angle: number): Point {
  return {
    x: center.x + rx * Math.cos(angle),
    y: center.y + ry * Math.sin(angle),
  };
}

export function ellipse(box: Bounds): Path {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const rx = box.width / 2;
  const ry = box.height / 2;
  return [moveTo(pointOnEllipse(center, rx, ry, 0)), ...arc(center, rx, ry, 0, 2 * Math.PI), close];
}

/** The Path in SVG path syntax. */
export function pathData(path: Path): string {
  return path
    .map((command) => {
      switch (command.type) {
        case "move":
          return `M ${command.to.x} ${command.to.y}`;
        case "line":
          return `L ${command.to.x} ${command.to.y}`;
        case "cubic": {
          const { control1, control2, to } = command;
          return `C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${to.x} ${to.y}`;
        }
        case "close":
          return "Z";
      }
    })
    .join(" ");
}

// Enough points along a cubic curve that a click near the outline lands on the right side of it.
const pointsPerCurve = 16;

function cubicPoint(from: Point, control1: Point, control2: Point, to: Point, t: number): Point {
  const u = 1 - t;
  const along = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return {
    x: along(from.x, control1.x, control2.x, to.x),
    y: along(from.y, control1.y, control2.y, to.y),
  };
}

// Each piece of the Path as the corners of a polygon, with curves followed by short straight lines.
function polygons(path: Path): readonly (readonly Point[])[] {
  return path.reduce<readonly (readonly Point[])[]>((pieces, command) => {
    const done = pieces.slice(0, -1);
    const current = pieces.at(-1) ?? [];
    const last = current.at(-1) ?? { x: 0, y: 0 };
    switch (command.type) {
      case "move":
        return [...pieces, [command.to]];
      case "line":
        return [...done, [...current, command.to]];
      case "cubic":
        return [
          ...done,
          [
            ...current,
            ...Array.from({ length: pointsPerCurve }, (_, index) =>
              cubicPoint(last, command.control1, command.control2, command.to, (index + 1) / pointsPerCurve),
            ),
          ],
        ];
      case "close":
        return pieces;
    }
  }, []);
}

/** The pieces of the Path, each from a `move` to just before the next. */
export function pathPieces(path: Path): readonly Path[] {
  return path.reduce<readonly Path[]>(
    (pieces, command) =>
      command.type === "move" || pieces.length === 0
        ? [...pieces, [command]]
        : [...pieces.slice(0, -1), [...(pieces.at(-1) ?? []), command]],
    [],
  );
}

/** Whether a piece of a Path is joined back to its start. */
export function isClosed(piece: Path): boolean {
  return piece.at(-1)?.type === "close";
}

/** How long a piece of a Path is, back to its start too when it is closed. */
export function pieceLength(piece: Path): number {
  const [corners = []] = polygons(piece);
  const [start] = corners;
  const points = isClosed(piece) && start ? [...corners, start] : corners;
  return points.slice(1).reduce((length, point, index) => {
    const previous = points[index] ?? point;
    return length + Math.hypot(point.x - previous.x, point.y - previous.y);
  }, 0);
}

// Even-odd ray casting: a ray from the point crosses the polygon's edges an odd number of times when it is inside.
function insidePolygon(corners: readonly Point[], point: Point): boolean {
  return corners.reduce((inside, corner, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length] ?? corner;
    const crosses =
      corner.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - corner.x) * (point.y - corner.y)) / (previous.y - corner.y) + corner.x;
    return crosses ? !inside : inside;
  }, false);
}

/** Whether `point` is inside any closed piece of the Path. */
export function insidePath(path: Path, point: Point): boolean {
  return polygons(path).some((corners) => insidePolygon(corners, point));
}
