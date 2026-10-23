import type { ShapeId, Sketch } from "./editor";
import type { Bounds } from "./geometry";
import { pathData } from "./path";
import { shapeGeometry } from "./shape-geometry";
import { svgElement, type SvgElement } from "./svg";
import type { SymbolId } from "./symbols";

/** How a Sketch is rendered: on screen, it shows aids for editing that an export leaves out. */
export type RenderOptions = {
  /** Whether a Shape with no lines of its own, such as text, shows a faint outline, so it can still be found. */
  readonly placeholders: boolean;
};

export const onScreen: RenderOptions = { placeholders: true };

export const forExport: RenderOptions = { placeholders: false };

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

type ShapeToRender = { readonly id?: ShapeId; readonly symbol: SymbolId; readonly bounds: Bounds };

/** A Shape drawn from its Symbol's geometry: the outline as its fill, and the Symbol's lines on top. */
export function renderShape({ id, symbol, bounds }: ShapeToRender, options: RenderOptions): SvgElement {
  const { outline, lines } = shapeGeometry(symbol, bounds);
  const placeholder = options.placeholders && lines.length === 0;
  return svgElement("g", { ...(id === undefined ? {} : { "data-shape": id }), "data-symbol": symbol }, [
    svgElement("path", { d: pathData(outline), ...(placeholder ? placeholderStyle : { fill: "none" }) }),
    ...(lines.length === 0 ? [] : [svgElement("path", { d: pathData(lines), ...lineStyle })]),
  ]);
}

/** Every Shape of the Sketch, in Sketch coordinates. */
export function renderSketch(sketch: Sketch, options: RenderOptions): SvgElement {
  return svgElement(
    "g",
    {},
    Object.values(sketch.shapes).map((shape) => renderShape(shape, options)),
  );
}
