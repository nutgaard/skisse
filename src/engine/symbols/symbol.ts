import type { Bounds, Point } from "../geometry";
import type { Path } from "../path";
import type { Size } from "../viewport";

export const horizontalAlignments = ["left", "center", "right"] as const;

/** Where a Label's lines sit across its Label area. */
export type HorizontalAlignment = (typeof horizontalAlignments)[number];

export const verticalAlignments = ["top", "middle", "bottom"] as const;

/** Where a Label's lines sit, together, from top to bottom of its Label area. */
export type VerticalAlignment = (typeof verticalAlignments)[number];

/** Where a Label sits in its Label area, in each direction. */
export type LabelAlignment = { readonly horizontal: HorizontalAlignment; readonly vertical: VerticalAlignment };

/** In the top-left corner, as for a Container, whose children take up its middle. */
export const topLeft: LabelAlignment = { horizontal: "left", vertical: "top" };

/** In the middle. */
export const inTheMiddle: LabelAlignment = { horizontal: "center", vertical: "middle" };

/**
 * Everything the editor knows about one Symbol. Each geometry function gets the box the Shape fills, in Sketch
 * coordinates, so a Symbol keeps its look at any size and aspect ratio.
 */
export type SymbolDefinition = {
  /** What the toolbar calls it. */
  readonly name: string;
  /** The single key that selects its tool. */
  readonly shortcut: string;
  /** The size of a Shape created by a click instead of a drag. */
  readonly defaultSize: Size;
  readonly canBeContainer: boolean;
  readonly defaultLabelAlignment: LabelAlignment;
  /** Whether the Shape is nothing but its Label, such as standalone text, and so is removed when its Label is empty. */
  readonly labelOnly: boolean;
  /** The area the Shape covers: filled, hit-tested, and where Arrow ends attach. */
  readonly outline: (box: Bounds) => Path;
  /** The lines drawn for the Shape. By default its outline. */
  readonly lines?: (box: Bounds) => Path;
  /** Where the Label's text goes. */
  readonly labelArea: (box: Bounds) => Bounds;
  /** The points Arrow ends snap to. By default the midpoints of the box's four sides. */
  readonly ports?: (box: Bounds) => readonly Point[];
  /** The picture on its toolbar button, in a square box. By default its lines, at its default aspect ratio. */
  readonly icon?: (box: Bounds) => Path;
};

/** The midpoints of the box's top, right, bottom and left sides. */
export function sideMidpoints({ x, y, width, height }: Bounds): readonly Point[] {
  return [
    { x: x + width / 2, y },
    { x: x + width, y: y + height / 2 },
    { x: x + width / 2, y: y + height },
    { x, y: y + height / 2 },
  ];
}

/** The box shrunk by `margin` on every side, but never past its middle. */
export function inset(box: Bounds, margin: number): Bounds {
  const horizontal = Math.min(margin, box.width / 2);
  const vertical = Math.min(margin, box.height / 2);
  return {
    x: box.x + horizontal,
    y: box.y + vertical,
    width: box.width - 2 * horizontal,
    height: box.height - 2 * vertical,
  };
}

/** The space kept between a Label and the lines around it. */
export const labelMargin = 8;
