import { rectangle as rectanglePath } from "../path";
import { inset, labelMargin, topLeft, type SymbolDefinition } from "./symbol";

export const rectangle: SymbolDefinition = {
  name: "Rectangle",
  shortcut: "r",
  defaultSize: { width: 160, height: 80 },
  canBeContainer: true,
  labelOnly: false,
  defaultLabelAlignment: topLeft,
  outline: rectanglePath,
  labelArea: (box) => inset(box, labelMargin),
};
