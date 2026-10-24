import type { FontSize, ShapeWithoutId, TextMeasurer } from "./editor";
import type { Bounds } from "./geometry";
import { symbolDefinition } from "./symbols";
import type { HorizontalAlignment, VerticalAlignment } from "./symbols/symbol";

/** The font Labels are drawn in. Text must be measured in it too, so it wraps where it is drawn. */
export const labelFontFamily = "system-ui, sans-serif";

// The size, in Sketch units, of each font size.
const fontPixels: Readonly<Record<FontSize, number>> = { small: 14, medium: 20, large: 28 };

// The height of a line, as a multiple of the font size.
const lineSpacing = 1.25;

export type LabelLine = { readonly text: string; readonly bounds: Bounds };

/** A Shape as displayed: grown to fit its Label, and the Label's lines laid out in its Label area. */
export type ShapeLayout = {
  /** The Shape's Bounds, taller than the user set them when its Label needs more room. */
  readonly bounds: Bounds;
  readonly labelArea: Bounds;
  /** Where the lines go together, as wide as the Label area. At least one line high, for a caret. */
  readonly textBlock: Bounds;
  readonly fontPixels: number;
  readonly lineHeight: number;
  readonly lines: readonly LabelLine[];
};

// Whether a line of text fits the width of the Label area.
type Fits = (line: string) => boolean;

// The longest start of `word` that fits, and then the rest broken the same way. A piece has at least one character,
// even when that doesn't fit, so breaking always ends.
function breakWord(word: string, fits: Fits): readonly string[] {
  const characters = Array.from(word);
  if (characters.length <= 1 || fits(word)) return [word];
  const length = Math.max(
    1,
    characters.findIndex((_, index) => !fits(characters.slice(0, index + 1).join(""))),
  );
  return [characters.slice(0, length).join(""), ...breakWord(characters.slice(length).join(""), fits)];
}

// The pieces of a paragraph that a line may break between: words, which are separated by a space that a break takes
// the place of, and parts of words after a hyphen, which stays at the end of the line. Browsers break lines in the
// same places, so the Label's text field wraps as the Label does.
type Piece = { readonly text: string; readonly afterSpace: boolean };

function pieces(paragraph: string): readonly Piece[] {
  return paragraph
    .split(" ")
    .flatMap((word, index) =>
      (word.match(/[^-]*-+|[^-]+/g) ?? [""]).map((text, part) => ({ text, afterSpace: index > 0 && part === 0 })),
    );
}

// Greedy wrapping: each piece goes on the current line if it fits there, and starts a new line otherwise. Spaces at
// the end of a line hang past its end, as in the browser, so they never start a new line, even one too narrow for any
// text.
function wrapParagraph(paragraph: string, fits: Fits): readonly string[] {
  return pieces(paragraph).reduce<readonly string[]>((lines, { text, afterSpace }) => {
    const current = lines.at(-1);
    const joined = current === undefined ? undefined : `${current}${afterSpace ? " " : ""}${text}`;
    return joined !== undefined && (text === "" || fits(joined.trimEnd()))
      ? [...lines.slice(0, -1), joined]
      : [...lines, ...breakWord(text, fits)];
  }, []);
}

// The lines of `text` wrapped by words. Explicit line breaks are kept. Empty text has no lines.
function wrapText(text: string, fits: Fits): readonly string[] {
  return text === "" ? [] : text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, fits));
}

function wrapLabel(shape: ShapeWithoutId, area: Bounds, measure: TextMeasurer): readonly string[] {
  const pixels = fontPixels[shape.style.fontSize];
  return wrapText(shape.label.text, (line) => measure(line, pixels) <= area.width);
}

function lineHeightOf(shape: ShapeWithoutId): number {
  return fontPixels[shape.style.fontSize] * lineSpacing;
}

// How much of the space left beside a Label goes before it, in each direction.
const shareOfSpace: Readonly<Record<HorizontalAlignment | VerticalAlignment, number>> = {
  left: 0,
  top: 0,
  center: 0.5,
  middle: 0.5,
  right: 1,
  bottom: 1,
};

function layoutIn(shape: ShapeWithoutId, bounds: Bounds, measure: TextMeasurer): ShapeLayout {
  const labelArea = symbolDefinition(shape.symbol).labelArea(bounds);
  const pixels = fontPixels[shape.style.fontSize];
  const lineHeight = lineHeightOf(shape);
  const texts = wrapLabel(shape, labelArea, measure);
  const { horizontal, vertical } = shape.label.alignment;
  const blockHeight = Math.max(1, texts.length) * lineHeight;
  const top = labelArea.y + (labelArea.height - blockHeight) * shareOfSpace[vertical];
  const lines = texts.map((text, index) => {
    // Placed by its text, leaving out the spaces that hang at its end.
    const width = measure(text.trimEnd(), pixels);
    return {
      text,
      bounds: {
        x: labelArea.x + (labelArea.width - width) * shareOfSpace[horizontal],
        y: top + index * lineHeight,
        width,
        height: lineHeight,
      },
    };
  });
  const textBlock = { x: labelArea.x, y: top, width: labelArea.width, height: blockHeight };
  return { bounds, labelArea, textBlock, fontPixels: pixels, lineHeight, lines };
}

// Whether the Label's lines fit the height of the Label area when the Shape is `height` high.
function fitsAtHeight(shape: ShapeWithoutId, height: number, measure: TextMeasurer): boolean {
  const area = symbolDefinition(shape.symbol).labelArea({ ...shape.bounds, height });
  return wrapLabel(shape, area, measure).length * lineHeightOf(shape) <= area.height;
}

// How precisely the height a Label needs is found.
const heightPrecision = 0.001;

// The least height, from the Shape's own height up, at which its Label fits. Any Symbol's Label area may be used, so
// the height is searched for: first doubling the growth until the Label fits, then halving the gap to the least
// height that does. A height on a round number of precision steps is taken when it fits, so that the result is exact
// whenever it can be.
function heightToFit(shape: ShapeWithoutId, measure: TextMeasurer): number {
  const fits = (height: number) => fitsAtHeight(shape, height, measure);
  const own = shape.bounds.height;
  if (fits(own)) return own;
  const grow = (growth: number, attempts: number): number =>
    fits(own + growth) || attempts === 0 ? own + growth : grow(growth * 2, attempts - 1);
  const narrow = (low: number, high: number): number => {
    if (high - low <= heightPrecision) return high;
    const middle = (low + high) / 2;
    return fits(middle) ? narrow(low, middle) : narrow(middle, high);
  };
  const least = narrow(own, grow(lineHeightOf(shape), 30));
  const rounded = Math.round(least / heightPrecision) * heightPrecision;
  return rounded > own && fits(rounded) ? rounded : least;
}

// Laying out a Label measures its text many times, and the same Shape is displayed again and again, such as on every
// pointer move of a drag. Shapes are never changed, so each one's layout is kept for as long as the Shape exists.
const layouts = new WeakMap<TextMeasurer, WeakMap<ShapeWithoutId, ShapeLayout>>();

/** The Shape as displayed, grown to fit its Label, with the Label laid out. */
export function shapeLayout(shape: ShapeWithoutId, measure: TextMeasurer): ShapeLayout {
  const known = layouts.get(measure) ?? new WeakMap<ShapeWithoutId, ShapeLayout>();
  layouts.set(measure, known);
  const layout = known.get(shape) ?? layoutIn(shape, { ...shape.bounds, height: heightToFit(shape, measure) }, measure);
  known.set(shape, layout);
  return layout;
}

/** The Shape's Bounds as displayed, grown to fit its Label. */
export function displayedBounds(shape: ShapeWithoutId, measure: TextMeasurer): Bounds {
  return shapeLayout(shape, measure).bounds;
}
