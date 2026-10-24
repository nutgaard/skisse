import type { ShapeId, Sketch, SymbolShape, TextMeasurer } from "./editor";
import { labelFontFamily, shapeLayout, type ShapeLayout } from "./label";
import { pathData } from "./path";
import { shapeGeometry } from "./shape-geometry";
import { svgElement, type SvgElement } from "./svg";

/** How a Sketch is rendered: on screen, it shows aids for editing that an export leaves out. */
export type RenderOptions = {
  /** Whether a Shape that shows nothing else, such as text without a Label, shows a faint outline to be found by. */
  readonly placeholders: boolean;
  /** A Shape whose Label is left out, as it is being edited and its text field shows it instead. */
  readonly hiddenLabel?: ShapeId;
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

/** A Shape to render. A Shape being drawn has no ID yet. */
export type ShapeToRender = Omit<SymbolShape, "id"> & { readonly id?: ShapeId };

// One text element per line. A centred line is drawn from its middle, so it stays centred even if the font is drawn
// slightly wider or narrower than measured.
function renderLabel({ lines, fontPixels }: ShapeLayout, centred: boolean): readonly SvgElement[] {
  return lines.map(({ text, bounds }) =>
    svgElement(
      "text",
      {
        x: centred ? bounds.x + bounds.width / 2 : bounds.x,
        y: bounds.y + bounds.height / 2,
        "font-family": labelFontFamily,
        "font-size": fontPixels,
        fill: lineStyle.stroke,
        "text-anchor": centred ? "middle" : "start",
        "dominant-baseline": "central",
      },
      [text],
    ),
  );
}

/**
 * A Shape drawn from its Symbol's geometry, grown to fit its Label: the outline as its fill, the Symbol's lines on top,
 * and then its Label.
 */
function renderShape(shape: ShapeToRender, measure: TextMeasurer, options: RenderOptions): SvgElement {
  const { id, symbol } = shape;
  const layout = shapeLayout(shape, measure);
  const { outline, lines } = shapeGeometry(symbol, layout.bounds);
  const label = id !== undefined && id === options.hiddenLabel ? [] : renderLabel(layout, shape.label.alignment === "center");
  const placeholder = options.placeholders && lines.length === 0 && label.length === 0;
  return svgElement("g", { ...(id === undefined ? {} : { "data-shape": id }), "data-symbol": symbol }, [
    svgElement("path", { d: pathData(outline), ...(placeholder ? placeholderStyle : { fill: "none" }) }),
    ...(lines.length === 0 ? [] : [svgElement("path", { d: pathData(lines), ...lineStyle })]),
    ...label,
  ]);
}

/** The Shapes, in Sketch coordinates, in the order given. */
export function renderShapes(
  shapes: readonly ShapeToRender[],
  measure: TextMeasurer,
  options: RenderOptions,
): SvgElement {
  return svgElement("g", {}, shapes.map((shape) => renderShape(shape, measure, options)));
}

/** Every Shape of the Sketch, in Sketch coordinates. */
export function renderSketch(sketch: Sketch, measure: TextMeasurer, options: RenderOptions): SvgElement {
  return renderShapes(Object.values(sketch.shapes), measure, options);
}
