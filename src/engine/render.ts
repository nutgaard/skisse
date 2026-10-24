import type { ShapeId, ShapeWithoutId, Sketch, TextMeasurer } from "./editor";
import { labelFontFamily, shapeLayout, shareOfSpace, type ShapeLayout } from "./label";
import { isClosed, pathData, pathPieces, pieceLength, type Path } from "./path";
import { shapeGeometry } from "./shape-geometry";
import { shades, type Style, type StrokePattern, type StrokeWidth } from "./style";
import { svgElement, type SvgElement } from "./svg";
import type { HorizontalAlignment } from "./symbols/symbol";

/** How a Sketch is rendered: on screen, it shows aids for editing that an export leaves out. */
export type RenderOptions = {
  /** Whether a Shape that shows nothing else, such as text without a Label, shows a faint outline to be found by. */
  readonly placeholders: boolean;
  /** A Shape whose Label is left out, as it is being edited and its text field shows it instead. */
  readonly hiddenLabel?: ShapeId;
};

export const onScreen: RenderOptions = { placeholders: true };

export const forExport: RenderOptions = { placeholders: false };

// The width of a Shape's lines, in Sketch units.
const strokePixels: Readonly<Record<StrokeWidth, number>> = { thin: 2, thick: 4 };

// A dash and the gap after it, in stroke widths. Lines have round ends, which reach half a stroke width past each end
// of a dash, so each dash shows a stroke width longer than set here, and each gap a stroke width shorter. A dash of 0
// shows as a round dot.
const dashSteps: Readonly<Record<Exclude<StrokePattern, "solid">, { readonly dash: number; readonly gap: number }>> = {
  dashed: { dash: 3, gap: 4 },
  dotted: { dash: 0, gap: 3 },
};

// The dashes of a piece of a Shape's lines, stretched or squeezed a little so a whole number of them fits it. A closed
// piece ends with a gap before the dash it starts with, and an open one ends with a dash, so that it shows at both
// ends. Otherwise a dash would be cut short, or two would run together, where the piece starts and ends.
function dashArray(piece: Path, { strokePattern, strokeWidth }: Style): string | undefined {
  if (strokePattern === "solid") return undefined;
  const width = strokePixels[strokeWidth];
  const dash = dashSteps[strokePattern].dash * width;
  const step = dash + dashSteps[strokePattern].gap * width;
  const length = pieceLength(piece);
  const fitted = isClosed(piece) ? length : length - dash;
  const scale = length / (Math.max(1, Math.round(fitted / step)) * step + (isClosed(piece) ? 0 : dash));
  return `${dash * scale} ${(step - dash) * scale}`;
}

// The lines of a Shape, a path for each piece so that each fits its own dashes.
function renderLines(lines: Path, style: Style): readonly SvgElement[] {
  return pathPieces(lines).map((piece) => {
    const dashes = dashArray(piece, style);
    return svgElement("path", {
      d: pathData(piece),
      fill: "none",
      stroke: shades[style.strokeColor].stroke,
      "stroke-width": strokePixels[style.strokeWidth],
      "stroke-linejoin": "round",
      "stroke-linecap": "round",
      ...(dashes === undefined ? {} : { "stroke-dasharray": dashes }),
    });
  });
}

// Drawn in screen pixels, so it stays thin at any zoom.
const placeholderStyle = {
  fill: "none",
  stroke: "#c4c4cc",
  "stroke-width": 1,
  "stroke-dasharray": "4 3",
  "vector-effect": "non-scaling-stroke",
};

/** A Shape to render. A Shape being drawn has no ID yet. */
export type ShapeToRender = ShapeWithoutId & { readonly id?: ShapeId };

// Where each line of a Label is drawn from: its start, middle or end, so it stays aligned even if the font is drawn
// slightly wider or narrower than measured.
const textAnchors: Readonly<Record<HorizontalAlignment, string>> = { left: "start", center: "middle", right: "end" };

// One text element per line, leaving out blank lines, in the colour of the Shape's lines. Spaces are drawn as typed,
// as they were measured, except those hanging at the end of a line.
function renderLabel(
  { lines, fontPixels }: ShapeLayout,
  horizontal: HorizontalAlignment,
  style: Style,
): readonly SvgElement[] {
  const share = shareOfSpace[horizontal];
  return lines.filter(({ text }) => text.trim() !== "").map(({ text, bounds }) =>
    svgElement(
      "text",
      {
        x: bounds.x + bounds.width * share,
        y: bounds.y + bounds.height / 2,
        "font-family": labelFontFamily,
        "font-size": fontPixels,
        fill: shades[style.strokeColor].stroke,
        "text-anchor": textAnchors[horizontal],
        "dominant-baseline": "central",
        "xml:space": "preserve",
      },
      [text.trimEnd()],
    ),
  );
}

// The outline, drawn under the lines in the Shape's fill, or with none when it is transparent. A text Shape that shows
// nothing else shows it as a faint placeholder instead.
function outlineStyle({ fill }: Style, placeholder: boolean) {
  if (placeholder) return placeholderStyle;
  return { fill: fill === "transparent" ? "none" : shades[fill].fill };
}

/**
 * A Shape drawn from its Symbol's geometry, grown to fit its Label: the outline as its fill, the Symbol's lines on top,
 * and then its Label.
 */
function renderShape(shape: ShapeToRender, measure: TextMeasurer, options: RenderOptions): SvgElement {
  const { id, symbol, style } = shape;
  const layout = shapeLayout(shape, measure);
  const { outline, lines } = shapeGeometry(symbol, layout.bounds);
  const labelHidden = id !== undefined && id === options.hiddenLabel;
  const label = labelHidden ? [] : renderLabel(layout, shape.label.alignment.horizontal, style);
  const placeholder = options.placeholders && lines.length === 0 && label.length === 0;
  return svgElement("g", { ...(id === undefined ? {} : { "data-shape": id }), "data-symbol": symbol }, [
    svgElement("path", { d: pathData(outline), ...outlineStyle(style, placeholder) }),
    ...renderLines(lines, style),
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
