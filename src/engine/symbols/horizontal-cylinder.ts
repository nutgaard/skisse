import type { Bounds } from "../geometry";
import { arc, close, lineTo, moveTo, type Path } from "../path";
import { inset, labelMargin, type SymbolDefinition } from "./symbol";

// A cylinder on its side, its lid facing right. Half the width of the lid's ellipse follows the height, as for the
// upright cylinder.
function lidRadius(box: Bounds): number {
  return Math.min(box.height * 0.15, box.width * 0.2);
}

function outline(box: Bounds): Path {
  const rx = lidRadius(box);
  const ry = box.height / 2;
  const centerY = box.y + ry;
  const bottom = box.y + box.height;
  return [
    moveTo({ x: box.x + rx, y: box.y }),
    lineTo({ x: box.x + box.width - rx, y: box.y }),
    ...arc({ x: box.x + box.width - rx, y: centerY }, rx, ry, -Math.PI / 2, Math.PI / 2),
    lineTo({ x: box.x + rx, y: bottom }),
    ...arc({ x: box.x + rx, y: centerY }, rx, ry, Math.PI / 2, (3 * Math.PI) / 2),
    close,
  ];
}

// The near edge of the lid, drawn across the right end of the body.
function lidEdge(box: Bounds): Path {
  const rx = lidRadius(box);
  const ry = box.height / 2;
  const centerX = box.x + box.width - rx;
  return [
    moveTo({ x: centerX, y: box.y }),
    ...arc({ x: centerX, y: box.y + ry }, rx, ry, -Math.PI / 2, -(3 * Math.PI) / 2),
  ];
}

export const horizontalCylinder: SymbolDefinition = {
  name: "Queue",
  shortcut: "q",
  defaultSize: { width: 160, height: 80 },
  canBeContainer: false,
  labelOnly: false,
  defaultLabelAlignment: "center",
  outline,
  lines: (box) => [...outline(box), ...lidEdge(box)],
  // The body, between the left end and the lid.
  labelArea: (box) => {
    const rx = lidRadius(box);
    return inset({ x: box.x + rx, y: box.y, width: box.width - 3 * rx, height: box.height }, labelMargin);
  },
};
