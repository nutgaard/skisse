/** The colours of the palette, the only ones a Shape can have, in the order the style panel shows them. */
export const palette = ["black", "red", "orange", "yellow", "green", "blue", "violet"] as const;

export type Color = (typeof palette)[number];

/**
 * How each colour of the palette is drawn: a strong shade for lines and Labels, and a light one for fills, so a Label
 * stays readable on a Shape filled with the colour of its lines.
 */
export const shades: Readonly<Record<Color, { readonly stroke: string; readonly fill: string }>> = {
  black: { stroke: "#1e1e1e", fill: "#e9ecef" },
  red: { stroke: "#e03131", fill: "#ffc9c9" },
  orange: { stroke: "#e8590c", fill: "#ffd8a8" },
  yellow: { stroke: "#f08c00", fill: "#ffec99" },
  green: { stroke: "#2f9e44", fill: "#b2f2bb" },
  blue: { stroke: "#1971c2", fill: "#a5d8ff" },
  violet: { stroke: "#6741d9", fill: "#d0bfff" },
};

/** The colour a Shape's lines and its Label's text are drawn in. */
export function lineColor(style: Style): string {
  return shades[style.strokeColor].stroke;
}

/** A Shape's fill: a colour of the palette, or none, which still hit-tests as if filled. */
export type Fill = Color | "transparent";

export const fills: readonly Fill[] = ["transparent", ...palette];

export const strokePatterns = ["solid", "dashed", "dotted"] as const;

export type StrokePattern = (typeof strokePatterns)[number];

export const strokeWidths = ["thin", "thick"] as const;

export type StrokeWidth = (typeof strokeWidths)[number];

/** The width of a Shape's lines, in Sketch units. */
export const strokePixels: Readonly<Record<StrokeWidth, number>> = { thin: 2, thick: 4 };

/** The three font sizes a Label can have. */
export const fontSizes = ["small", "medium", "large"] as const;

export type FontSize = (typeof fontSizes)[number];

/** How a Shape is drawn: its lines, its fill, and its Label's text, which takes the colour of the lines. */
export type Style = {
  readonly strokeColor: Color;
  readonly fill: Fill;
  readonly strokePattern: StrokePattern;
  readonly strokeWidth: StrokeWidth;
  readonly fontSize: FontSize;
};

/** The style of Shapes until another is chosen. */
export const defaultStyle: Style = {
  strokeColor: "black",
  fill: "transparent",
  strokePattern: "solid",
  strokeWidth: "thin",
  fontSize: "medium",
};

// The values each property of a style can have.
const choices: { readonly [Property in keyof Style]: readonly Style[Property][] } = {
  strokeColor: palette,
  fill: fills,
  strokePattern: strokePatterns,
  strokeWidth: strokeWidths,
  fontSize: fontSizes,
};

/**
 * The properties of `style` with a value a Shape can have, leaving out any other, such as a colour that is not in the
 * palette.
 */
export function validStyle(style: Partial<Style>): Partial<Style> {
  return Object.fromEntries(
    Object.entries(style).filter(
      ([property, value]) =>
        Object.hasOwn(choices, property) && (choices[property as keyof Style] as readonly unknown[]).includes(value),
    ),
  );
}
