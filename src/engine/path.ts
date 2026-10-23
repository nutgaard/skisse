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

export const moveTo = (to: Point): PathCommand => ({ type: "move", to });

export const lineTo = (to: Point): PathCommand => ({ type: "line", to });

export const close: PathCommand = { type: "close" };

/** A closed piece through `points`, joined by straight lines. */
export const polygon = (points: readonly Point[]): Path => [
  ...points.flatMap((point, index) => (index === 0 ? [moveTo(point)] : [lineTo(point)])),
  close,
];

export const rectangle = ({ x, y, width, height }: Bounds): Path =>
  polygon([
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ]);

/**
 * Curves along the ellipse around `center` with radii `rx` and `ry`, from angle `from` to angle `to`, in radians. Angle
 * 0 points right and angles grow clockwise on screen. The Path is expected to be at the start of the arc already.
 */
export const arc = (center: Point, rx: number, ry: number, from: number, to: number): Path => {
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
};

// The point on the ellipse around `center` at `angle`, as for `arc`.
const pointOnEllipse = (center: Point, rx: number, ry: number, angle: number): Point => ({
  x: center.x + rx * Math.cos(angle),
  y: center.y + ry * Math.sin(angle),
});

export const ellipse = (box: Bounds): Path => {
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const rx = box.width / 2;
  const ry = box.height / 2;
  return [moveTo(pointOnEllipse(center, rx, ry, 0)), ...arc(center, rx, ry, 0, 2 * Math.PI), close];
};

/** The Path in SVG path syntax. */
export const pathData = (path: Path): string =>
  path
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

// Enough points along a cubic curve that a click near the outline lands on the right side of it.
const pointsPerCurve = 16;

const cubicPoint = (from: Point, control1: Point, control2: Point, to: Point, t: number): Point => {
  const u = 1 - t;
  const along = (a: number, b: number, c: number, d: number) =>
    u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  return {
    x: along(from.x, control1.x, control2.x, to.x),
    y: along(from.y, control1.y, control2.y, to.y),
  };
};

// Each piece of the Path as the corners of a polygon, with curves followed by short straight lines.
const polygons = (path: Path): readonly (readonly Point[])[] =>
  path.reduce<readonly (readonly Point[])[]>((pieces, command) => {
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

// Even-odd ray casting: a ray from the point crosses the polygon's edges an odd number of times when it is inside.
const insidePolygon = (corners: readonly Point[], point: Point): boolean =>
  corners.reduce((inside, corner, index) => {
    const previous = corners[(index + corners.length - 1) % corners.length] ?? corner;
    const crosses =
      corner.y > point.y !== previous.y > point.y &&
      point.x < ((previous.x - corner.x) * (point.y - corner.y)) / (previous.y - corner.y) + corner.x;
    return crosses ? !inside : inside;
  }, false);

/** Whether `point` is inside any closed piece of the Path. */
export const insidePath = (path: Path, point: Point): boolean =>
  polygons(path).some((corners) => insidePolygon(corners, point));
