import type { ShapeId, Sketch } from "./editor";
import { enclosingBounds, type Bounds } from "./geometry";
import { pathData } from "./path";
import { shapeGeometry } from "./shape-geometry";
import { svgElement, type SvgElement } from "./svg";
import type { SymbolId } from "./symbols";

/** How a Sketch is drawn: on screen, it shows aids for editing that an export leaves out. */
export type DrawOptions = {
  /** Whether a Shape with no lines of its own, such as text, shows a faint outline, so it can still be found. */
  readonly placeholders: boolean;
};

export const onScreen: DrawOptions = { placeholders: true };

export const forExport: DrawOptions = { placeholders: false };

const lineStyle = {
  fill: "none",
  stroke: "#1e1e1e",
  "stroke-width": 2,
  "stroke-linejoin": "round",
};

// Drawn in screen pixels, so it stays thin at any zoom.
const placeholderStyle = {
  fill: "none",
  stroke: "#c4c4cc",
  "stroke-width": 1,
  "stroke-dasharray": "4 3",
  "vector-effect": "non-scaling-stroke",
};

type ShapeToDraw = { readonly id?: ShapeId; readonly symbol: SymbolId; readonly bounds: Bounds };

/** A Shape drawn from its Symbol's geometry: the outline as its fill, and the Symbol's lines on top. */
export function drawShape({ id, symbol, bounds }: ShapeToDraw, options: DrawOptions): SvgElement {
  const { outline, lines } = shapeGeometry(symbol, bounds);
  const placeholder = options.placeholders && lines.length === 0;
  return svgElement("g", { ...(id === undefined ? {} : { "data-shape": id }), "data-symbol": symbol }, [
    svgElement("path", { d: pathData(outline), ...(placeholder ? placeholderStyle : { fill: "none" }) }),
    ...(lines.length === 0 ? [] : [svgElement("path", { d: pathData(lines), ...lineStyle })]),
  ]);
}

/** Every Shape of the Sketch, in Sketch coordinates. */
export function drawSketch(sketch: Sketch, options: DrawOptions): SvgElement {
  return svgElement(
    "g",
    {},
    Object.values(sketch.shapes).map((shape) => drawShape(shape, options)),
  );
}

/** The smallest Bounds around everything on the Sketch, or `undefined` when it is empty. */
export function contentBounds(sketch: Sketch): Bounds | undefined {
  const all = Object.values(sketch.shapes).map(({ bounds }) => bounds);
  return all.length === 0 ? undefined : enclosingBounds(all);
}
