import type { Bounds } from "../geometry";
import { close, lineTo, moveTo, type Path } from "../path";
import { inset, labelMargin, type SymbolDefinition } from "./symbol";

// How far the wavy bottom edge rises above the bottom of the box at its ends.
// It follows the height, but stays low on a narrow document so the wave doesn't turn spiky.
const waveHeight = (box: Bounds): number => Math.min(box.height * 0.1, box.width * 0.12);

// A sheet whose bottom edge waves: up over a crest on the right, down to the bottom of the box in the middle, and up
// again to the left.
const outline = (box: Bounds): Path => {
  const wave = waveHeight(box);
  const at = (fraction: number, height: number) => ({
    x: box.x + box.width * fraction,
    y: box.y + box.height - height,
  });
  return [
    moveTo({ x: box.x, y: box.y }),
    lineTo({ x: box.x + box.width, y: box.y }),
    lineTo(at(1, wave)),
    { type: "cubic", control1: at(0.85, 2.5 * wave), control2: at(0.7, 0), to: at(0.5, 0) },
    { type: "cubic", control1: at(0.3, 0), control2: at(0.15, wave), to: at(0, wave) },
    close,
  ];
};

// Not just `document`, which would hide the browser's global of that name.
export const documentSymbol: SymbolDefinition = {
  name: "Document",
  shortcut: "f",
  defaultSize: { width: 120, height: 80 },
  canBeContainer: false,
  defaultLabelAlignment: "center",
  outline,
  // Above the wave.
  labelArea: (box) => inset({ ...box, height: box.height - 2 * waveHeight(box) }, labelMargin),
};
