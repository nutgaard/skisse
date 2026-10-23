import type { Bounds, Point } from "../geometry";
import { arc, close, moveTo, type Path } from "../path";
import type { SymbolDefinition } from "./symbol";

// The cloud is drawn in a unit box and stretched to fit. It is a ring of bumps, each a circular arc from one dip to
// the next, bulging outwards by `bulge`. The bumps on top, right, bottom and left are centred on the box's sides and
// just reach them, so the Ports at the sides' midpoints lie on the outline.
type Bump = { readonly to: Point; readonly bulge: number };

const start: Point = { x: 0.34, y: 0.2 };

// A big bump on top between two puffy shoulders, small bumps on the sides, and a long, flat one along the bottom.
const bumps: readonly Bump[] = [
  { to: { x: 0.66, y: 0.2 }, bulge: 0.2 },
  { to: { x: 0.88, y: 0.4 }, bulge: 0.12 },
  { to: { x: 0.88, y: 0.6 }, bulge: 0.12 },
  { to: { x: 0.7, y: 0.9 }, bulge: 0.1 },
  { to: { x: 0.3, y: 0.9 }, bulge: 0.1 },
  { to: { x: 0.12, y: 0.6 }, bulge: 0.1 },
  { to: { x: 0.12, y: 0.4 }, bulge: 0.12 },
  { to: start, bulge: 0.12 },
];

// The circle through `from` and `to` that bulges `bulge` outwards (to the left of the way the outline runs) halfway.
const bumpCircle = (from: Point, to: Point, bulge: number) => {
  const chord = { x: to.x - from.x, y: to.y - from.y };
  const length = Math.hypot(chord.x, chord.y);
  const outwards = { x: chord.y / length, y: -chord.x / length };
  const radius = (length * length) / 4 / (2 * bulge) + bulge / 2;
  const middle = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  return {
    center: { x: middle.x - outwards.x * (radius - bulge), y: middle.y - outwards.y * (radius - bulge) },
    radius,
  };
};

// The arc of a bump, stretched from the unit box into `box`. It runs clockwise, the way the outline goes.
const bumpArc = (box: Bounds, from: Point, { to, bulge }: Bump): Path => {
  const { center, radius } = bumpCircle(from, to, bulge);
  const startAngle = Math.atan2(from.y - center.y, from.x - center.x);
  const endAngle = Math.atan2(to.y - center.y, to.x - center.x);
  const turn = (((endAngle - startAngle) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return arc(
    { x: box.x + center.x * box.width, y: box.y + center.y * box.height },
    radius * box.width,
    radius * box.height,
    startAngle,
    startAngle + turn,
  );
};

const outline = (box: Bounds): Path => [
  moveTo({ x: box.x + start.x * box.width, y: box.y + start.y * box.height }),
  ...bumps.flatMap((bump, index) => bumpArc(box, bumps[index - 1]?.to ?? start, bump)),
  close,
];

export const cloud: SymbolDefinition = {
  name: "Cloud",
  shortcut: "k",
  defaultSize: { width: 160, height: 100 },
  canBeContainer: true,
  defaultLabelAlignment: "topLeft",
  outline,
  // Inside the dips between the bumps.
  labelArea: (box) => ({
    x: box.x + box.width * 0.2,
    y: box.y + box.height * 0.26,
    width: box.width * 0.6,
    height: box.height * 0.6,
  }),
};
