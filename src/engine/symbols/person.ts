import type { Bounds } from "../geometry";
import { arc, close, ellipse, lineTo, moveTo, type Path } from "../path";
import { centred, inset, labelMargin, type SymbolDefinition } from "./symbol";

// A round head on top of a torso with rounded shoulders. The head stays round at any aspect ratio, so the person
// stays recognisable when stretched.
function headRadius(box: Bounds): number {
  return Math.min(box.height * 0.16, box.width * 0.3);
}

// A small gap between the head and the torso.
function neck(box: Bounds): number {
  return box.height * 0.03;
}

function outline(box: Bounds): Path {
  const r = headRadius(box);
  const centerX = box.x + box.width / 2;
  const torsoTop = box.y + 2 * r + neck(box);
  const middle = box.y + box.height / 2;
  // The shoulders curve down to the middle of the sides, so the side Ports lie on the outline.
  const shoulderWidth = box.width * 0.35;
  const shoulderHeight = middle - torsoTop;
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  return [
    ...ellipse({ x: centerX - r, y: box.y, width: 2 * r, height: 2 * r }),
    moveTo({ x: box.x, y: bottom }),
    lineTo({ x: box.x, y: middle }),
    ...arc({ x: box.x + shoulderWidth, y: middle }, shoulderWidth, shoulderHeight, Math.PI, (3 * Math.PI) / 2),
    lineTo({ x: right - shoulderWidth, y: torsoTop }),
    ...arc({ x: right - shoulderWidth, y: middle }, shoulderWidth, shoulderHeight, -Math.PI / 2, 0),
    lineTo({ x: right, y: bottom }),
    close,
  ];
}

export const person: SymbolDefinition = {
  name: "Person",
  shortcut: "p",
  defaultSize: { width: 80, height: 120 },
  canBeContainer: false,
  labelOnly: false,
  defaultLabelAlignment: centred,
  outline,
  // The lower half of the torso, below the shoulders.
  labelArea: (box) => inset({ ...box, y: box.y + box.height / 2, height: box.height / 2 }, labelMargin),
};
