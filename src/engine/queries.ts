import { isArrow, isSymbolShape, type ArrowEnd, type EndName, type Routing } from "./arrow";
import {
  arrowBeingDrawn,
  creationBounds,
  newShape,
  portTarget,
  resizableShape,
  resolved,
  type EditorState,
  type ShapeId,
  type Sketch,
} from "./editor";
import { boundsBetween, type Bounds, type Point } from "./geometry";
import * as history from "./history";
import { displayedBounds, shapeLayout, type LabelLine } from "./label";
import { arrowToRender, onScreen, renderShapes, shapesToRender, type Renderable } from "./render";
import { handlePositions, type ResizeHandle } from "./resize";
import { shapeGeometry } from "./shape-geometry";
import { lineColor, type FontSize, type Style } from "./style";
import type { SvgElement } from "./svg";
import type { SymbolId } from "./symbols";
import type { LabelAlignment } from "./symbols/symbol";
import type { Tool } from "./tools";
import { childrenOf, drawOrder, drawOrderLifting } from "./tree";
import type { Viewport } from "./viewport";

export { arrowEndHandles, pansOnPress } from "./editor";
export type { ArrowEndHandleView } from "./editor";

// What queries return about a Shape made from a Symbol. Kept apart from the stored SymbolShape so the stored model can
// change without changing what the view and the tests see.
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
  if (!shape || isArrow(shape)) return undefined;
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

/**
 * Every Shape made from a Symbol, with its Bounds as displayed: grown to fit its Label. In the order drawn, from bottom
 * to top.
 */
export function shapes(state: EditorState): readonly ShapeView[] {
  return drawOrder(state.sketch).filter(isSymbolShape).map((shape) => ({
    id: shape.id,
    symbol: shape.symbol,
    bounds: displayedBounds(shape, state.deps.measureText),
  }));
}

/** What an Arrow end is bound to: a Shape, and one of its Ports, by its place in the Symbol's list, if at a Port. */
export type BindingView = { readonly shape: ShapeId; readonly port?: number };

/** Where an Arrow end is, and what it is bound to, if anything. A floating end has no Binding. */
export type ArrowEndView = { readonly point: Point; readonly binding?: BindingView };

/** What queries return about an Arrow: where it is, and what its ends are bound to. */
export type ArrowView = {
  readonly id: ShapeId;
  readonly routing: Routing;
  readonly start: ArrowEndView;
  readonly end: ArrowEndView;
  /** The points the Arrow's line runs through, from its start to its end. */
  readonly path: readonly Point[];
};

function endView(end: ArrowEnd, point: Point): ArrowEndView {
  switch (end.kind) {
    case "floating":
      return { point };
    case "port":
      return { point, binding: { shape: end.shape, port: end.port } };
    case "outline":
      return { point, binding: { shape: end.shape } };
  }
}

/** Every Arrow, with its path resolved and its Bindings. In the order drawn, from bottom to top. */
export function arrows(state: EditorState): readonly ArrowView[] {
  return drawOrder(state.sketch)
    .filter(isArrow)
    .flatMap((arrow) => {
      const placed = resolved(state, arrow);
      return placed
        ? [
            {
              id: arrow.id,
              routing: arrow.routing,
              start: endView(arrow.start, placed.start),
              end: endView(arrow.end, placed.end),
              path: placed.path,
            },
          ]
        : [];
    });
}

/** The Ports shown on a Shape, and which of them an Arrow end would snap to, if any. */
export type PortsView = {
  readonly shape: ShapeId;
  readonly ports: readonly Point[];
  readonly snapsTo: number | undefined;
};

/**
 * The Ports of the Shape under the pointer while hovering with the Arrow tool, or under an Arrow end being drawn or
 * dragged. `undefined` when no Ports are shown.
 */
export function visiblePorts(state: EditorState): PortsView | undefined {
  const target = portTarget(state);
  if (!target) return undefined;
  const { shape, snapsTo } = target;
  const { ports } = shapeGeometry(shape.symbol, displayedBounds(shape, state.deps.measureText));
  return { shape: shape.id, ports, snapsTo };
}

/** A Shape and the Shapes directly inside it, from bottom to top. */
export type ShapeTree = { readonly id: ShapeId; readonly children: readonly ShapeTree[] };

function treeInside(state: EditorState, parent: ShapeId | undefined): readonly ShapeTree[] {
  return childrenOf(state.sketch, parent).map(({ id }) => ({ id, children: treeInside(state, id) }));
}

/** The Shapes at the top level, each with the Shapes inside it, from bottom to top. */
export function shapeTree(state: EditorState): readonly ShapeTree[] {
  return treeInside(state, undefined);
}

/** How a Shape is drawn, as last chosen for it. */
export function shapeStyle(state: EditorState, id: ShapeId): Style | undefined {
  return state.sketch.shapes[id]?.style;
}

// The value of `property` that `first` and all of `others` have, or `mixed` when they differ.
function commonOrMixed<T, Property extends keyof T>(
  first: T,
  others: readonly T[],
  property: Property,
): T[Property] | "mixed" {
  return others.every((other) => other[property] === first[property]) ? first[property] : "mixed";
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
  return {
    strokeColor: commonOrMixed(first, others, "strokeColor"),
    fill: commonOrMixed(first, others, "fill"),
    strokePattern: commonOrMixed(first, others, "strokePattern"),
    strokeWidth: commonOrMixed(first, others, "strokeWidth"),
    fontSize: commonOrMixed(first, others, "fontSize"),
  };
}

/** A Label alignment as the style panel shows it, where each direction can be mixed among the selected Shapes. */
export type SelectionAlignment = {
  readonly [Direction in keyof LabelAlignment]: LabelAlignment[Direction] | "mixed";
};

/**
 * The Label alignment of the selected Shapes, each direction `mixed` where they differ, or `undefined` with nothing
 * selected, as Shapes are created with their Symbol's own alignment.
 */
export function selectionAlignment(state: EditorState): SelectionAlignment | undefined {
  const [first, ...others] = state.selection.flatMap((id) => {
    const shape = state.sketch.shapes[id];
    return shape && isSymbolShape(shape) ? [shape.label.alignment] : [];
  });
  if (!first) return undefined;
  return {
    horizontal: commonOrMixed(first, others, "horizontal"),
    vertical: commonOrMixed(first, others, "vertical"),
  };
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
  | { readonly kind: "drawingArrow" }
  | { readonly kind: "draggingArrowEnd"; readonly arrowId: ShapeId; readonly end: EndName }
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
    case "drawingArrow":
      return { kind: "drawingArrow" };
    case "draggingArrowEnd":
      return { kind: "draggingArrowEnd", arrowId: interaction.arrowId, end: interaction.end };
    case "panning":
      return { kind: "panning" };
    case "editingLabel":
      return { kind: "editingLabel", shapeId: interaction.shapeId };
  }
}

/**
 * The Sketch as rendered on screen, in Sketch coordinates, including a Shape or Arrow being drawn, and with Shapes
 * being dragged in front. The selection, handles and Ports are not part of it.
 */
export function rendering(state: EditorState): SvgElement {
  const interaction = currentInteraction(state);
  const { measureText } = state.deps;
  const arrow = arrowBeingDrawn(state);
  const beingDrawn: readonly Renderable[] =
    interaction.kind === "creatingShape"
      ? [newShape(interaction.symbol, interaction.bounds, state.style)]
      : arrow
        ? arrowToRender(state.sketch, arrow, measureText)
        : [];
  // Shapes being dragged are drawn above all the others until dropped, so they never pass behind a Shape they cross.
  const placed =
    interaction.kind === "moving" ? drawOrderLifting(state.sketch, state.selection) : drawOrder(state.sketch);
  return renderShapes([...shapesToRender(state.sketch, placed, measureText), ...beingDrawn], measureText, {
    ...onScreen,
    hiddenLabel: interaction.kind === "editingLabel" ? interaction.shapeId : undefined,
  });
}
