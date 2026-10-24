import type { Bounds } from "../geometry";
import { arc, close, lineTo, moveTo, type Path } from "../path";
import { centred, inset, labelMargin, type SymbolDefinition } from "./symbol";

// Half the height of the lid's ellipse. It follows the width, so the lid keeps its look on a tall cylinder, but a low
// cylinder flattens it so the body still shows.
function lidRadius(box: Bounds): number {
  return Math.min(box.width * 0.15, box.height * 0.2);
}

function outline(box: Bounds): Path {
  const ry = lidRadius(box);
  const rx = box.width / 2;
  const centerX = box.x + rx;
  const right = box.x + box.width;
  return [
    moveTo({ x: box.x, y: box.y + ry }),
    ...arc({ x: centerX, y: box.y + ry }, rx, ry, Math.PI, 2 * Math.PI),
    lineTo({ x: right, y: box.y + box.height - ry }),
    ...arc({ x: centerX, y: box.y + box.height - ry }, rx, ry, 0, Math.PI),
    close,
  ];
}

// The near edge of the lid, drawn across the top of the body.
function lidEdge(box: Bounds): Path {
  const ry = lidRadius(box);
  const rx = box.width / 2;
  return [moveTo({ x: box.x, y: box.y + ry }), ...arc({ x: box.x + rx, y: box.y + ry }, rx, ry, Math.PI, 0)];
}

export const cylinder: SymbolDefinition = {
  name: "Cylinder",
  shortcut: "c",
  defaultSize: { width: 100, height: 120 },
  canBeContainer: false,
  labelOnly: false,
  defaultLabelAlignment: centred,
  outline,
  lines: (box) => [...outline(box), ...lidEdge(box)],
  // The body, below the lid and above the bottom curve.
  labelArea: (box) => {
    const ry = lidRadius(box);
    return inset({ x: box.x, y: box.y + 2 * ry, width: box.width, height: box.height - 3 * ry }, labelMargin);
  },
};
