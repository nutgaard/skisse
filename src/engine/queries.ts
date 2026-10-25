import {
  arrowsBoundTo,
  layoutArrowLabel,
  type ArrowEnd,
  type Arrowhead,
  type EndHeads,
  type EndName,
  type Routing,
} from "./arrow";
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
import { isArrow, isSymbolShape } from "./shape-kind";
import { lineColor, type FontSize, type Style } from "./style";
import type { SvgElement } from "./svg";
import type { SymbolId } from "./symbols";
import type { LabelAlignment } from "./symbols/symbol";
import type { Tool } from "./tools";
import { childrenOf, drawOrder, drawOrderLifting, withDescendants } from "./tree";
import type { Viewport } from "./viewport";

export { arrowEndHandles, middleSegmentHandle, pansOnPress } from "./editor";
export type { ArrowEndHandleView, MiddleSegmentHandleView } from "./editor";

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

/** The Label of a Shape or an Arrow, laid out as it is drawn. */
export function labelLayout(state: EditorState, id: ShapeId): LabelView | undefined {
  const shape = state.sketch.shapes[id];
  if (!shape) return undefined;
  if (isArrow(shape)) {
    const resolvedArrow = resolved(state, shape);
    if (!resolvedArrow) return undefined;
    const { textBlock, fontPixels, lineHeight, lines } = layoutArrowLabel(shape, resolvedArrow, state.deps.measureText);
    return {
      text: shape.label.text,
      alignment: { horizontal: "center", vertical: "middle" },
      fontSize: shape.style.fontSize,
      color: lineColor(shape.style),
      fontPixels,
      lineHeight,
      area: textBlock,
      textBlock,
      lines,
    };
  }
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
  readonly heads: EndHeads;
  /** The points the Arrow's line runs through, from its start to its end. */
  readonly path: readonly Point[];
  readonly label: ArrowLabelView;
};

/**
 * An Arrow's Label: its text, how far along the path it was put as a share of its length, the point where it is shown,
 * and the gap around it in the line, unless it shows nothing. It is shown at its share, unless that would take it too
 * close to an end.
 */
export type ArrowLabelView = {
  readonly text: string;
  readonly along: number;
  readonly at: Point;
  readonly gap?: Bounds;
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
      const resolvedArrow = resolved(state, arrow);
      const layout = resolvedArrow && layoutArrowLabel(arrow, resolvedArrow, state.deps.measureText);
      return resolvedArrow && layout
        ? [
            {
              id: arrow.id,
              routing: arrow.routing,
              start: endView(arrow.start, resolvedArrow.start),
              end: endView(arrow.end, resolvedArrow.end),
              heads: arrow.heads,
              path: resolvedArrow.path,
              label: { ...arrow.label, at: layout.at, gap: layout.gap },
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

/**
 * The Routing of the selected Arrows, `mixed` where they differ. With nothing selected, it is the Routing new Arrows
 * get, which choosing a Routing changes. `undefined` when only Shapes made from a Symbol are selected, as they have no
 * Routing.
 */
export function selectionRouting(state: EditorState): Routing | "mixed" | undefined {
  if (state.selection.length === 0) return state.routing;
  const [first, ...others] = state.selection.flatMap((id) => {
    const shape = state.sketch.shapes[id];
    return shape && isArrow(shape) ? [shape] : [];
  });
  return first && commonOrMixed(first, others, "routing");
}

/** The heads of Arrows as the style panel shows them, where each end can be mixed among the selected Arrows. */
export type SelectionArrowheads = { readonly [End in EndName]: Arrowhead | "mixed" };

/**
 * The heads of the selected Arrows, each end `mixed` where they differ. With nothing selected, they are the heads new
 * Arrows get, which choosing a head changes. `undefined` when only Shapes made from a Symbol are selected, as they have
 * no heads.
 */
export function selectionArrowheads(state: EditorState): SelectionArrowheads | undefined {
  if (state.selection.length === 0) return state.heads;
  const [first, ...others] = state.selection.flatMap((id) => {
    const shape = state.sketch.shapes[id];
    return shape && isArrow(shape) ? [shape.heads] : [];
  });
  if (!first) return undefined;
  return { start: commonOrMixed(first, others, "start"), end: commonOrMixed(first, others, "end") };
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
  | { readonly kind: "draggingElbowSegment"; readonly arrowId: ShapeId }
  | { readonly kind: "draggingArrowLabel"; readonly arrowId: ShapeId }
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
    case "draggingElbowSegment":
      return { kind: "draggingElbowSegment", arrowId: interaction.arrowId };
    case "draggingArrowLabel":
      return { kind: "draggingArrowLabel", arrowId: interaction.arrowId };
    case "panning":
      return { kind: "panning" };
    case "editingLabel":
      return { kind: "editingLabel", shapeId: interaction.shapeId };
  }
}

// The Shapes drawn above all the others until let go. Shapes being dragged are, so they never pass behind a Shape they
// cross, and the Arrows bound to them come along. So does an Arrow whose end is being dragged, as the end can be bound
// to a Shape outside its Container before the Arrow joins the Container holding both its ends on letting go. Either
// way, an Arrow never passes behind a Shape it is bound to.
function liftedWhileDragging(state: EditorState): readonly ShapeId[] {
  const { interaction } = state;
  if (interaction.kind === "draggingArrowEnd") return [interaction.arrowId];
  if (interaction.kind !== "moving") return [];
  const dragged = withDescendants(state.sketch, state.selection);
  return [...dragged, ...arrowsBoundTo(state.sketch, dragged)];
}

/**
 * The Sketch as rendered on screen, in Sketch coordinates, including a Shape or Arrow being drawn, and with Shapes
 * being dragged, or an Arrow whose end is being dragged, in front. The selection, handles and Ports are not part of it.
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
  const placed = drawOrderLifting(state.sketch, liftedWhileDragging(state));
  return renderShapes([...shapesToRender(state.sketch, placed, measureText), ...beingDrawn], measureText, {
    ...onScreen(state.viewport.zoom),
    hiddenLabel: interaction.kind === "editingLabel" ? interaction.shapeId : undefined,
  });
}
