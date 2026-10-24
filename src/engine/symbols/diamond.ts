import { polygon } from "../path";
import { inset, inTheMiddle, labelMargin, sideMidpoints, type SymbolDefinition } from "./symbol";

export const diamond: SymbolDefinition = {
  name: "Diamond",
  shortcut: "d",
  defaultSize: { width: 140, height: 100 },
  canBeContainer: false,
  labelOnly: false,
  defaultLabelAlignment: inTheMiddle,
  outline: (box) => polygon(sideMidpoints(box)),
  // The largest rectangle inside the diamond, whose corners touch its sides.
  labelArea: (box) =>
    inset(
      { x: box.x + box.width / 4, y: box.y + box.height / 4, width: box.width / 2, height: box.height / 2 },
      labelMargin / 2,
    ),
};
