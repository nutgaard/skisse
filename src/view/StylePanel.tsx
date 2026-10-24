import type { ReactNode } from "react";
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
  type HorizontalAlignment,
  type Input,
  type SelectionAlignment,
  type SelectionStyle,
  type StrokePattern,
  type StrokeWidth,
  type Style,
  type VerticalAlignment,
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

// A Label's lines, or where they sit in its Label area, drawn in a 16 by 16 box.
function AlignmentIcon({ path, framed = false }: { readonly path: string; readonly framed?: boolean }) {
  return (
    <svg className="alignment-icon" width="16" height="16" aria-hidden="true">
      {framed && <rect className="alignment-frame" x="2" y="2" width="12" height="12" rx="1" />}
      <path d={path} />
    </svg>
  );
}

const horizontalAlignmentChoices: readonly Choice<HorizontalAlignment>[] = [
  { value: "left", content: <AlignmentIcon path="M 2 4 H 14 M 2 8 H 10 M 2 12 H 12" />, title: "Align left" },
  { value: "center", content: <AlignmentIcon path="M 2 4 H 14 M 4 8 H 12 M 3 12 H 13" />, title: "Align centre" },
  { value: "right", content: <AlignmentIcon path="M 2 4 H 14 M 6 8 H 14 M 4 12 H 14" />, title: "Align right" },
];

const verticalAlignmentChoices: readonly Choice<VerticalAlignment>[] = [
  { value: "top", content: <AlignmentIcon path="M 5 5 H 11" framed />, title: "Align top" },
  { value: "middle", content: <AlignmentIcon path="M 5 8 H 11" framed />, title: "Align middle" },
  { value: "bottom", content: <AlignmentIcon path="M 5 11 H 11" framed />, title: "Align bottom" },
];

type PanelGroupProps = {
  readonly name: string;
  /** Whether the selected Shapes differ in what the group shows, which it then says. */
  readonly mixed: boolean;
  /** How many choices go on a row. */
  readonly columns: number;
  readonly children: ReactNode;
};

function PanelGroup({ name, mixed, columns, children }: PanelGroupProps) {
  return (
    <div className="style-group" role="group" aria-label={name}>
      <span className="style-group-name">
        {name}
        {mixed && <span className="style-mixed"> · mixed</span>}
      </span>
      <div className="style-choices" style={{ gridTemplateColumns: `repeat(${columns}, auto)` }}>
        {children}
      </div>
    </div>
  );
}

type StyleGroupProps<T> = {
  readonly name: string;
  readonly choices: readonly Choice<T>[];
  readonly chosen: T | "mixed";
  readonly onChoose: (value: T) => void;
};

// One property of the style, which shows no choice as chosen when the selected Shapes differ in it.
function StyleGroup<T extends string>({ name, choices, chosen, onChoose }: StyleGroupProps<T>) {
  const mixed = chosen === "mixed";
  return (
    <PanelGroup name={name} mixed={mixed} columns={4}>
      <Choices choices={choices} chosen={mixed ? undefined : chosen} onChoose={onChoose} />
    </PanelGroup>
  );
}

type AlignmentGroupProps = {
  readonly alignment: SelectionAlignment | undefined;
  readonly dispatch: (input: Input) => void;
};

// The Label alignment, a row for each direction. With nothing selected there is no Label to align.
function AlignmentGroup({ alignment, dispatch }: AlignmentGroupProps) {
  const unlessMixed = <T,>(value: T | "mixed" | undefined) => (value === "mixed" ? undefined : value);
  return (
    <PanelGroup
      name="Align"
      mixed={alignment?.horizontal === "mixed" || alignment?.vertical === "mixed"}
      columns={3}
    >
      <Choices
        choices={horizontalAlignmentChoices}
        chosen={unlessMixed(alignment?.horizontal)}
        disabled={!alignment}
        onChoose={(horizontal) => dispatch({ type: "changeLabelAlignment", alignment: { horizontal } })}
      />
      <Choices
        choices={verticalAlignmentChoices}
        chosen={unlessMixed(alignment?.vertical)}
        disabled={!alignment}
        onChoose={(vertical) => dispatch({ type: "changeLabelAlignment", alignment: { vertical } })}
      />
    </PanelGroup>
  );
}

type StylePanelProps = {
  readonly style: SelectionStyle;
  readonly alignment: SelectionAlignment | undefined;
  readonly dispatch: (input: Input) => void;
};

/**
 * The style and Label alignment of the selected Shapes, to see and change. With nothing selected, it shows and changes
 * the style of the Shapes drawn next.
 */
export function StylePanel({ style, alignment, dispatch }: StylePanelProps) {
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
      <AlignmentGroup alignment={alignment} dispatch={dispatch} />
    </div>
  );
}
