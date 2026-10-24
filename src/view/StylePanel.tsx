import type { ReactNode } from "react";
import {
  arrowheads,
  fills,
  fontSizes,
  palette,
  shades,
  strokePatterns,
  strokeWidths,
  type Arrowhead,
  type Color,
  type EndName,
  type Fill,
  type FontSize,
  type HorizontalAlignment,
  type Input,
  type LabelAlignment,
  type Routing,
  type SelectionAlignment,
  type SelectionArrowheads,
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

// A line from the bottom left to the top right of a 24 by 16 box, as each Routing runs it.
function RoutingIcon({ path }: { readonly path: string }) {
  return (
    <svg className="routing-icon" width="24" height="16" aria-hidden="true">
      <path d={path} />
    </svg>
  );
}

// Curved Routing is in the model, but not built yet, so it isn't offered.
const routingChoices: readonly Choice<Routing>[] = [
  { value: "straight", content: <RoutingIcon path="M 4 13 L 20 3" />, title: "Straight" },
  { value: "elbow", content: <RoutingIcon path="M 4 13 H 12 V 3 H 20" />, title: "Elbow" },
];

// Each arrowhead drawn at the right end of a line across a 16 by 16 box, filled or not.
const arrowheadIcons: Readonly<Record<Arrowhead, ReactNode>> = {
  none: null,
  arrow: <path className="filled" d="M 14 8 L 8 5 L 8 11 Z" />,
  openArrow: <path d="M 8 5 L 14 8 L 8 11" />,
  diamond: <path className="filled" d="M 14 8 L 10.5 5.5 L 7 8 L 10.5 10.5 Z" />,
  circle: <circle className="filled" cx="11.5" cy="8" r="2.5" />,
};

const arrowheadNames: Readonly<Record<Arrowhead, string>> = {
  none: "No head",
  arrow: "Arrow",
  openArrow: "Open arrow",
  diamond: "Diamond",
  circle: "Circle",
};

// A line with the arrowhead at the end it is for, the left for the start and the right for the end.
function ArrowheadIcon({ arrowhead, end }: { readonly arrowhead: Arrowhead; readonly end: EndName }) {
  return (
    <svg className="arrowhead-icon" width="16" height="16" aria-hidden="true">
      <g transform={end === "start" ? "matrix(-1 0 0 1 16 0)" : undefined}>
        <path d="M 2 8 H 14" />
        {arrowheadIcons[arrowhead]}
      </g>
    </svg>
  );
}

function arrowheadChoices(end: EndName): readonly Choice<Arrowhead>[] {
  return arrowheads.map((arrowhead) => ({
    value: arrowhead,
    content: <ArrowheadIcon arrowhead={arrowhead} end={end} />,
    title: `${arrowheadNames[arrowhead]} at the ${end}`,
  }));
}

const arrowheadChoicesAt: Readonly<Record<EndName, readonly Choice<Arrowhead>[]>> = {
  start: arrowheadChoices("start"),
  end: arrowheadChoices("end"),
};

// What a group shows as chosen when the selected Shapes differ in it: nothing.
function unlessMixed<T>(value: T | "mixed"): T | undefined {
  return value === "mixed" ? undefined : value;
}

type PanelGroupProps = {
  readonly name: string;
  /** Whether the selected Shapes differ in what the group shows, which it then says. */
  readonly mixed: boolean;
  /** How many choices go on a row. */
  readonly columns: 3 | 4 | 5;
  readonly children: ReactNode;
};

// A named group of choices in the panel, laid out in rows.
function PanelGroup({ name, mixed, columns, children }: PanelGroupProps) {
  return (
    <div className="style-group" role="group" aria-label={name}>
      <span className="style-group-name">
        {name}
        {mixed && <span className="style-mixed"> · mixed</span>}
      </span>
      <div className="style-choices" data-columns={columns}>
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
  return (
    <PanelGroup name={name} mixed={chosen === "mixed"} columns={4}>
      <Choices choices={choices} chosen={unlessMixed(chosen)} onChoose={onChoose} />
    </PanelGroup>
  );
}

type AlignmentGroupProps = {
  readonly alignment: SelectionAlignment | undefined;
  readonly onAlign: (alignment: Partial<LabelAlignment>) => void;
};

// The Label alignment, a row for each direction. With nothing selected there is no Label to align.
function AlignmentGroup({ alignment, onAlign }: AlignmentGroupProps) {
  return (
    <PanelGroup
      name="Align"
      mixed={alignment?.horizontal === "mixed" || alignment?.vertical === "mixed"}
      columns={3}
    >
      <Choices
        choices={horizontalAlignmentChoices}
        chosen={alignment && unlessMixed(alignment.horizontal)}
        disabled={!alignment}
        onChoose={(horizontal) => onAlign({ horizontal })}
      />
      <Choices
        choices={verticalAlignmentChoices}
        chosen={alignment && unlessMixed(alignment.vertical)}
        disabled={!alignment}
        onChoose={(vertical) => onAlign({ vertical })}
      />
    </PanelGroup>
  );
}

type RoutingGroupProps = {
  readonly routing: Routing | "mixed" | undefined;
  readonly onRoute: (routing: Routing) => void;
};

// How the selected Arrows run. With only Shapes made from a Symbol selected there is nothing to route.
function RoutingGroup({ routing, onRoute }: RoutingGroupProps) {
  return (
    <PanelGroup name="Routing" mixed={routing === "mixed"} columns={4}>
      <Choices
        choices={routingChoices}
        chosen={routing && unlessMixed(routing)}
        disabled={!routing}
        onChoose={onRoute}
      />
    </PanelGroup>
  );
}

type ArrowheadsGroupProps = {
  readonly heads: SelectionArrowheads | undefined;
  readonly onChoose: (end: EndName, arrowhead: Arrowhead) => void;
};

// The heads of the selected Arrows, a row for each end. With only Shapes made from a Symbol selected there are none.
function ArrowheadsGroup({ heads, onChoose }: ArrowheadsGroupProps) {
  return (
    <PanelGroup name="Arrowheads" mixed={heads?.start === "mixed" || heads?.end === "mixed"} columns={5}>
      {(["start", "end"] as const).map((end) => (
        <Choices
          key={end}
          choices={arrowheadChoicesAt[end]}
          chosen={heads && unlessMixed(heads[end])}
          disabled={!heads}
          onChoose={(arrowhead) => onChoose(end, arrowhead)}
        />
      ))}
    </PanelGroup>
  );
}

type StylePanelProps = {
  readonly style: SelectionStyle;
  readonly alignment: SelectionAlignment | undefined;
  readonly routing: Routing | "mixed" | undefined;
  readonly heads: SelectionArrowheads | undefined;
  readonly dispatch: (input: Input) => void;
};

/**
 * The style, Label alignment, Routing and arrowheads of the selected Shapes, to see and change. With nothing selected,
 * it shows and changes the style of the Shapes drawn next, and the Routing and arrowheads of the Arrows drawn next.
 */
export function StylePanel({ style, alignment, routing, heads, dispatch }: StylePanelProps) {
  const choose = (chosen: Partial<Style>) => dispatch({ type: "changeStyle", style: chosen });
  const align = (aligned: Partial<LabelAlignment>) => dispatch({ type: "changeLabelAlignment", alignment: aligned });
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
      <AlignmentGroup alignment={alignment} onAlign={align} />
      <RoutingGroup routing={routing} onRoute={(chosen) => dispatch({ type: "changeRouting", routing: chosen })} />
      <ArrowheadsGroup
        heads={heads}
        onChoose={(end, arrowhead) => dispatch({ type: "changeArrowhead", end, arrowhead })}
      />
    </div>
  );
}
