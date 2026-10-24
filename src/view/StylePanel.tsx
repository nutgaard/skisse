import {
  fills,
  fontSizes,
  palette,
  shades,
  strokePatterns,
  strokeWidths,
  type Color,
  type Fill,
  type FontSize,
  type Input,
  type SelectionStyle,
  type StrokePattern,
  type StrokeWidth,
  type Style,
} from "../engine";
import { Choices, type Choice } from "./Choices";

function capitalized(word: string) {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function Swatch({ color }: { readonly color: string }) {
  return <span className="swatch" style={{ background: color }} />;
}

const strokeColorChoices: readonly Choice<Color>[] = palette.map((color) => ({
  value: color,
  content: <Swatch color={shades[color].stroke} />,
  title: `${capitalized(color)} stroke`,
}));

// No fill shows as white, struck through.
const fillChoices: readonly Choice<Fill>[] = fills.map((fill) => ({
  value: fill,
  content: fill === "transparent" ? <span className="swatch transparent" /> : <Swatch color={shades[fill].fill} />,
  title: `${capitalized(fill)} fill`,
}));

// A short line drawn as the choice would draw a Shape's lines.
function StrokeIcon({ dashes, width = 2 }: { readonly dashes?: string; readonly width?: number }) {
  return (
    <svg className="stroke-icon" width="24" height="16" aria-hidden="true">
      <line x1="3" y1="8" x2="21" y2="8" strokeWidth={width} strokeDasharray={dashes} />
    </svg>
  );
}

// The dashes of each stroke pattern's icon, in the icon's pixels.
const iconDashes: Readonly<Record<StrokePattern, string | undefined>> = {
  solid: undefined,
  dashed: "4 5",
  dotted: "0 4.5",
};

const strokePatternChoices: readonly Choice<StrokePattern>[] = strokePatterns.map((pattern) => ({
  value: pattern,
  content: <StrokeIcon dashes={iconDashes[pattern]} />,
  title: `${capitalized(pattern)} stroke`,
}));

// The width of each stroke width's icon, in the icon's pixels.
const iconWidths: Readonly<Record<StrokeWidth, number>> = { thin: 1.5, thick: 3.5 };

const strokeWidthChoices: readonly Choice<StrokeWidth>[] = strokeWidths.map((width) => ({
  value: width,
  content: <StrokeIcon width={iconWidths[width]} />,
  title: `${capitalized(width)} stroke`,
}));

// S, M and L.
const fontSizeChoices: readonly Choice<FontSize>[] = fontSizes.map((size) => ({
  value: size,
  content: size.charAt(0).toUpperCase(),
  title: `${capitalized(size)} text`,
}));

type StyleGroupProps<T> = {
  readonly name: string;
  readonly choices: readonly Choice<T>[];
  readonly chosen: T | "mixed";
  readonly onChoose: (value: T) => void;
};

// One property of the style, which says so when the selected Shapes differ in it, and then shows no choice as chosen.
function StyleGroup<T extends string>({ name, choices, chosen, onChoose }: StyleGroupProps<T>) {
  const mixed = chosen === "mixed";
  return (
    <div className="style-group" role="group" aria-label={name}>
      <span className="style-group-name">
        {name}
        {mixed && <span className="style-mixed"> · mixed</span>}
      </span>
      <div className="style-choices">
        <Choices choices={choices} chosen={mixed ? undefined : chosen} onChoose={onChoose} />
      </div>
    </div>
  );
}

type StylePanelProps = { readonly style: SelectionStyle; readonly dispatch: (input: Input) => void };

/**
 * The style of the selected Shapes, to see and change. With nothing selected, it shows and changes the style of the
 * Shapes drawn next.
 */
export function StylePanel({ style, dispatch }: StylePanelProps) {
  const choose = (chosen: Partial<Style>) => dispatch({ type: "changeStyle", style: chosen });
  return (
    <div className="toolbar style-panel" role="toolbar" aria-label="Style">
      <StyleGroup
        name="Stroke"
        choices={strokeColorChoices}
        chosen={style.strokeColor}
        onChoose={(strokeColor) => choose({ strokeColor })}
      />
      <StyleGroup name="Fill" choices={fillChoices} chosen={style.fill} onChoose={(fill) => choose({ fill })} />
      <StyleGroup
        name="Stroke style"
        choices={strokePatternChoices}
        chosen={style.strokePattern}
        onChoose={(strokePattern) => choose({ strokePattern })}
      />
      <StyleGroup
        name="Stroke width"
        choices={strokeWidthChoices}
        chosen={style.strokeWidth}
        onChoose={(strokeWidth) => choose({ strokeWidth })}
      />
      <StyleGroup
        name="Text size"
        choices={fontSizeChoices}
        chosen={style.fontSize}
        onChoose={(fontSize) => choose({ fontSize })}
      />
    </div>
  );
}
