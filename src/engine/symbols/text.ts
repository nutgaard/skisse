import { lineTo, moveTo, rectangle } from "../path";
import { inset, type SymbolDefinition } from "./symbol";

// Standalone text: just a Label, with a box to click but no lines of its own.
export const text: SymbolDefinition = {
  name: "Text",
  shortcut: "t",
  defaultSize: { width: 120, height: 40 },
  canBeContainer: false,
  labelOnly: true,
  defaultLabelAlignment: "center",
  outline: rectangle,
  lines: () => [],
  labelArea: (box) => inset(box, 4),
  // A capital T.
  icon: ({ x, y, width, height }) => [
    moveTo({ x: x + width * 0.2, y: y + height * 0.15 }),
    lineTo({ x: x + width * 0.8, y: y + height * 0.15 }),
    moveTo({ x: x + width / 2, y: y + height * 0.15 }),
    lineTo({ x: x + width / 2, y: y + height * 0.85 }),
  ],
};
