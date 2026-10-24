import {
  palette,
  shades,
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

function colorName(color: Color) {
  return color.charAt(0).toUpperCase() + color.slice(1);
}

function Swatch({ color }: { readonly color: string }) {
  return <span className="swatch" style={{ background: color }} />;
}

const strokeColors: readonly Choice<Color>[] = palette.map((color) => ({
  value: color,
  name: <Swatch color={shades[color].stroke} />,
  title: `${colorName(color)} stroke`,
}));

const fills: readonly Choice<Fill>[] = [
  { value: "transparent", name: <span className="swatch transparent" />, title: "Transparent fill" },
  ...palette.map((color) => ({
    value: color,
    name: <Swatch color={shades[color].fill} />,
    title: `${colorName(color)} fill`,
  })),
];

// A short line drawn as the choice would draw a Shape's lines.
function StrokeIcon({ dashes, width = 2 }: { readonly dashes?: string; readonly width?: number }) {
  return (
    <svg className="stroke-icon" width="24" height="16" aria-hidden="true">
      <line x1="3" y1="8" x2="21" y2="8" strokeWidth={width} strokeDasharray={dashes} />
    </svg>
  );
}

const strokePatterns: readonly Choice<StrokePattern>[] = [
  { value: "solid", name: <StrokeIcon />, title: "Solid stroke" },
  { value: "dashed", name: <StrokeIcon dashes="4 5" />, title: "Dashed stroke" },
  { value: "dotted", name: <StrokeIcon dashes="0 4.5" />, title: "Dotted stroke" },
];

const strokeWidths: readonly Choice<StrokeWidth>[] = [
  { value: "thin", name: <StrokeIcon width={1.5} />, title: "Thin stroke" },
  { value: "thick", name: <StrokeIcon width={3.5} />, title: "Thick stroke" },
];

const fontSizes: readonly Choice<FontSize>[] = [
  { value: "small", name: "S", title: "Small text" },
  { value: "medium", name: "M", title: "Medium text" },
  { value: "large", name: "L", title: "Large text" },
];

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
        choices={strokeColors}
        chosen={style.strokeColor}
        onChoose={(strokeColor) => choose({ strokeColor })}
      />
      <StyleGroup name="Fill" choices={fills} chosen={style.fill} onChoose={(fill) => choose({ fill })} />
      <StyleGroup
        name="Stroke style"
        choices={strokePatterns}
        chosen={style.strokePattern}
        onChoose={(strokePattern) => choose({ strokePattern })}
      />
      <StyleGroup
        name="Stroke width"
        choices={strokeWidths}
        chosen={style.strokeWidth}
        onChoose={(strokeWidth) => choose({ strokeWidth })}
      />
      <StyleGroup
        name="Text size"
        choices={fontSizes}
        chosen={style.fontSize}
        onChoose={(fontSize) => choose({ fontSize })}
      />
    </div>
  );
}
