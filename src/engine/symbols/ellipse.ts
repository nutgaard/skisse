import { ellipse as ellipsePath } from "../path";
import { inset, inTheMiddle, labelMargin, type SymbolDefinition } from "./symbol";

export const ellipse: SymbolDefinition = {
  name: "Ellipse",
  shortcut: "o",
  defaultSize: { width: 120, height: 80 },
  canBeContainer: false,
  labelOnly: false,
  defaultLabelAlignment: inTheMiddle,
  outline: ellipsePath,
  // The largest rectangle inside the ellipse, whose corners touch it.
  labelArea: (box) =>
    inset(
      {
        x: box.x + (box.width * (1 - Math.SQRT1_2)) / 2,
        y: box.y + (box.height * (1 - Math.SQRT1_2)) / 2,
        width: box.width * Math.SQRT1_2,
        height: box.height * Math.SQRT1_2,
      },
      labelMargin / 2,
    ),
};
