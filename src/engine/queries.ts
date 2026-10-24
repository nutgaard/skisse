import {
  creationBounds,
  newShape,
  resizableShape,
  type EditorState,
  type ShapeId,
  type Sketch,
} from "./editor";
import { boundsBetween, type Bounds, type Point } from "./geometry";
import * as history from "./history";
import { displayedBounds, shapeLayout, type LabelLine } from "./label";
import { onScreen, renderShapes, type ShapeToRender } from "./render";
import { handlePositions, type ResizeHandle } from "./resize";
import { lineColor, type FontSize, type Style } from "./style";
import type { SvgElement } from "./svg";
import type { SymbolId } from "./symbols";
import type { HorizontalAlignment, LabelAlignment, VerticalAlignment } from "./symbols/symbol";
import type { Tool } from "./tools";
import type { Viewport } from "./viewport";

export { pansOnPress } from "./editor";

// What queries return about a Shape. Kept apart from the stored SymbolShape so the stored model can change
// without changing what the view and the tests see.
export type ShapeView = {
  readonly id: ShapeId;
  readonly symbol: SymbolId;
  readonly bounds: Bounds;
};

export type LabelView = {
  readonly text: string;
  readonly alignment: LabelAlignment;
  readonly fontSize: FontSize;
  /** The colour the text is drawn in, which is that of the Shape's lines. */
  readonly color: string;
  /** The size of the font, in Sketch units. */
  readonly fontPixels: number;
  readonly lineHeight: number;
  /** Where the Label's text goes, in the Shape as displayed. */
  readonly area: Bounds;
  /** Where the lines go together, as wide as the Label area. At least one line high, for a caret. */
  readonly textBlock: Bounds;
  /** The text as wrapped, each line where it is drawn. */
  readonly lines: readonly LabelLine[];
};

/** The Label of a Shape, laid out as it is drawn. */
export function labelLayout(state: EditorState, id: ShapeId): LabelView | undefined {
  const shape = state.sketch.shapes[id];
  if (!shape) return undefined;
  const { labelArea, textBlock, fontPixels, lineHeight, lines } = shapeLayout(shape, state.deps.measureText);
  return {
    text: shape.label.text,
    alignment: shape.label.alignment,
    fontSize: shape.style.fontSize,
    color: lineColor(shape.style),
    fontPixels,
    lineHeight,
    area: labelArea,
    textBlock,
    lines,
  };
}

/** Every Shape, with its Bounds as displayed: grown to fit its Label. */
export function shapes(state: EditorState): readonly ShapeView[] {
  return Object.values(state.sketch.shapes).map((shape) => ({
    id: shape.id,
    symbol: shape.symbol,
    bounds: displayedBounds(shape, state.deps.measureText),
  }));
}

/** How a Shape is drawn, as last chosen for it. */
export function shapeStyle(state: EditorState, id: ShapeId): Style | undefined {
  return state.sketch.shapes[id]?.style;
}

/** A style as the style panel shows it, where each property can be mixed among the selected Shapes. */
export type SelectionStyle = { readonly [Property in keyof Style]: Style[Property] | "mixed" };

/**
 * The style of the selected Shapes, each property `mixed` where they differ. With nothing selected, it is the style new
 * Shapes get, which choosing a style changes.
 */
export function selectionStyle(state: EditorState): SelectionStyle {
  const styles = state.selection.flatMap((id) => state.sketch.shapes[id]?.style ?? []);
  const [first = state.style, ...others] = styles;
  const common = <Property extends keyof Style>(property: Property): Style[Property] | "mixed" =>
    others.every((style) => style[property] === first[property]) ? first[property] : "mixed";
  return {
    strokeColor: common("strokeColor"),
    fill: common("fill"),
    strokePattern: common("strokePattern"),
    strokeWidth: common("strokeWidth"),
    fontSize: common("fontSize"),
  };
}

/** A Label alignment as the style panel shows it, where each direction can be mixed among the selected Shapes. */
export type SelectionAlignment = {
  readonly horizontal: HorizontalAlignment | "mixed";
  readonly vertical: VerticalAlignment | "mixed";
};

/**
 * The Label alignment of the selected Shapes, each direction `mixed` where they differ, or `undefined` with nothing
 * selected, as Shapes are created with their Symbol's own alignment.
 */
export function selectionAlignment(state: EditorState): SelectionAlignment | undefined {
  const [first, ...others] = state.selection.flatMap((id) => state.sketch.shapes[id]?.label.alignment ?? []);
  if (!first) return undefined;
  const common = <Direction extends keyof LabelAlignment>(direction: Direction): LabelAlignment[Direction] | "mixed" =>
    others.every((alignment) => alignment[direction] === first[direction]) ? first[direction] : "mixed";
  return { horizontal: common("horizontal"), vertical: common("vertical") };
}

/** The Sketch as of the last finished change, leaving out any gesture still in progress. This is what to save. */
export function sketch(state: EditorState): Sketch {
  return state.history.present;
}

export function selection(state: EditorState): readonly ShapeId[] {
  return state.selection;
}

export type HandleView = { readonly handle: ResizeHandle; readonly position: Point };

export function resizeHandles(state: EditorState): readonly HandleView[] {
  const shape = resizableShape(state);
  return shape ? handlePositions(displayedBounds(shape, state.deps.measureText)) : [];
}

export function canUndo(state: EditorState): boolean {
  return history.canUndo(state.history);
}

export function canRedo(state: EditorState): boolean {
  return history.canRedo(state.history);
}

export function viewport(state: EditorState): Viewport {
  return state.viewport;
}

export function activeTool(state: EditorState): Tool {
  return state.tool;
}

export type InteractionView =
  | { readonly kind: "idle" }
  // Pressed with a Symbol tool, but not dragged yet. Releasing places a default-size Shape, but nothing is shown until
  // then, as the press may still become a drag.
  | { readonly kind: "placingShape"; readonly symbol: SymbolId }
  | { readonly kind: "creatingShape"; readonly symbol: SymbolId; readonly bounds: Bounds }
  | { readonly kind: "marqueeSelecting"; readonly bounds: Bounds }
  | { readonly kind: "moving" }
  | { readonly kind: "resizing"; readonly handle: ResizeHandle }
  | { readonly kind: "panning" }
  | { readonly kind: "editingLabel"; readonly shapeId: ShapeId };

export function currentInteraction(state: EditorState): InteractionView {
  const { interaction } = state;
  switch (interaction.kind) {
    case "idle":
      return { kind: "idle" };
    case "creatingShape":
      return interaction.dragged
        ? { kind: "creatingShape", symbol: interaction.symbol, bounds: creationBounds(interaction) }
        : { kind: "placingShape", symbol: interaction.symbol };
    case "marqueeSelecting":
      return { kind: "marqueeSelecting", bounds: boundsBetween(interaction.origin, interaction.current) };
    case "moving":
      return { kind: "moving" };
    case "resizing":
      return { kind: "resizing", handle: interaction.handle };
    case "panning":
      return { kind: "panning" };
    case "editingLabel":
      return { kind: "editingLabel", shapeId: interaction.shapeId };
  }
}

/**
 * The Sketch as rendered on screen, in Sketch coordinates, including a Shape being drawn. The selection and resize
 * handles are not part of it.
 */
export function rendering(state: EditorState): SvgElement {
  const interaction = currentInteraction(state);
  const beingDrawn: readonly ShapeToRender[] =
    interaction.kind === "creatingShape" ? [newShape(interaction.symbol, interaction.bounds, state.style)] : [];
  return renderShapes([...Object.values(state.sketch.shapes), ...beingDrawn], state.deps.measureText, {
    ...onScreen,
    hiddenLabel: interaction.kind === "editingLabel" ? interaction.shapeId : undefined,
  });
}
