import type { Bounds, Point } from "./geometry";
import { insidePath, type Path } from "./path";
import { symbolDefinition, type SymbolId } from "./symbols";
import { sideMidpoints } from "./symbols/symbol";

/** What a Symbol looks like in a given box, with the definition's defaults filled in. */
export type ShapeGeometry = {
  /** The area the Shape covers: filled, hit-tested, and where Arrow ends attach. */
  readonly outline: Path;
  /** The lines drawn for the Shape. */
  readonly lines: Path;
  /** Where the Label's text goes. */
  readonly labelArea: Bounds;
  /** The points Arrow ends snap to. */
  readonly ports: readonly Point[];
};

export const shapeGeometry = (symbol: SymbolId, box: Bounds): ShapeGeometry => {
  const definition = symbolDefinition(symbol);
  const outline = definition.outline(box);
  return {
    outline,
    lines: definition.lines?.(box) ?? outline,
    labelArea: definition.labelArea(box),
    ports: (definition.ports ?? sideMidpoints)(box),
  };
};

/** Whether `point` hits a Shape of `symbol` filling `box`. Anywhere inside the outline counts, even with no fill. */
export const hitsOutline = (symbol: SymbolId, box: Bounds, point: Point): boolean =>
  insidePath(symbolDefinition(symbol).outline(box), point);

/** The picture for the Symbol's toolbar button, in a `size` square. */
export const symbolIcon = (symbol: SymbolId, size: number): Path => {
  const definition = symbolDefinition(symbol);
  if (definition.icon) return definition.icon({ x: 0, y: 0, width: size, height: size });
  const { width, height } = definition.defaultSize;
  const scale = size / Math.max(width, height);
  const box = {
    x: (size - width * scale) / 2,
    y: (size - height * scale) / 2,
    width: width * scale,
    height: height * scale,
  };
  return shapeGeometry(symbol, box).lines;
};
