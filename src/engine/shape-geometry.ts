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

export function shapeGeometry(symbol: SymbolId, box: Bounds): ShapeGeometry {
  const definition = symbolDefinition(symbol);
  const outline = definition.outline(box);
  return {
    outline,
    lines: definition.lines?.(box) ?? outline,
    labelArea: definition.labelArea(box),
    ports: (definition.ports ?? sideMidpoints)(box),
  };
}

/** Whether `point` hits a Shape of `symbol` filling `box`. Anywhere inside the outline counts, even with no fill. */
export function hitsOutline(symbol: SymbolId, box: Bounds, point: Point): boolean {
  return insidePath(symbolDefinition(symbol).outline(box), point);
}
