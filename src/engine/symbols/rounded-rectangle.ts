import type { Bounds } from "../geometry";
import { arc, close, lineTo, moveTo, type Path } from "../path";
import { inset, labelMargin, type SymbolDefinition } from "./symbol";

// The corner radius, which stays the same at any size unless the Shape gets too small for it.
function cornerRadius(box: Bounds): number {
  return Math.min(12, box.width / 4, box.height / 4);
}

function outline(box: Bounds): Path {
  const r = cornerRadius(box);
  const left = box.x;
  const right = box.x + box.width;
  const top = box.y;
  const bottom = box.y + box.height;
  return [
    moveTo({ x: left + r, y: top }),
    lineTo({ x: right - r, y: top }),
    ...arc({ x: right - r, y: top + r }, r, r, -Math.PI / 2, 0),
    lineTo({ x: right, y: bottom - r }),
    ...arc({ x: right - r, y: bottom - r }, r, r, 0, Math.PI / 2),
    lineTo({ x: left + r, y: bottom }),
    ...arc({ x: left + r, y: bottom - r }, r, r, Math.PI / 2, Math.PI),
    lineTo({ x: left, y: top + r }),
    ...arc({ x: left + r, y: top + r }, r, r, Math.PI, (3 * Math.PI) / 2),
    close,
  ];
}

export const roundedRectangle: SymbolDefinition = {
  name: "Rounded rectangle",
  shortcut: "u",
  defaultSize: { width: 160, height: 80 },
  canBeContainer: true,
  defaultLabelAlignment: "topLeft",
  outline,
  labelArea: (box) => inset(box, labelMargin),
};
