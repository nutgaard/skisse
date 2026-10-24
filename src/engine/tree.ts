import type { ShapeId, Sketch, SymbolShape } from "./editor";

/** Where a Shape is among the others: in which Container, and where among its siblings. */
export type Placement = Pick<SymbolShape, "parent" | "z">;

/** The Shapes directly inside `parent`, or at the top level for `undefined`, from bottom to top. */
export function childrenOf(sketch: Sketch, parent: ShapeId | undefined): readonly SymbolShape[] {
  return Object.values(sketch.shapes)
    .filter((shape) => shape.parent === parent)
    .sort((a, b) => a.z - b.z);
}

/** Every Shape inside `parent`, or every Shape for `undefined`, as drawn: each just before its children. */
export function drawOrder(sketch: Sketch, parent?: ShapeId): readonly SymbolShape[] {
  return childrenOf(sketch, parent).flatMap((shape) => [shape, ...drawOrder(sketch, shape.id)]);
}

// The IDs of the Shapes that `keep` allows, as drawn.
function idsAsDrawn(sketch: Sketch, keep: (id: ShapeId) => boolean): readonly ShapeId[] {
  return drawOrder(sketch)
    .map(({ id }) => id)
    .filter(keep);
}

/** Whether `id` is `ancestor` or somewhere inside it. */
export function isWithin(sketch: Sketch, id: ShapeId, ancestor: ShapeId): boolean {
  const parent = sketch.shapes[id]?.parent;
  return id === ancestor || (parent !== undefined && isWithin(sketch, parent, ancestor));
}

/** The Shapes of `ids` that are not inside another of them, as drawn. */
export function outermost(sketch: Sketch, ids: readonly ShapeId[]): readonly ShapeId[] {
  return idsAsDrawn(
    sketch,
    (id) => ids.includes(id) && !ids.some((other) => other !== id && isWithin(sketch, id, other)),
  );
}

/** The Shapes of `ids` and every Shape inside them, as drawn. */
export function withDescendants(sketch: Sketch, ids: readonly ShapeId[]): readonly ShapeId[] {
  return idsAsDrawn(sketch, (id) => ids.some((ancestor) => isWithin(sketch, id, ancestor)));
}

/** In `parent`, on top of the Shapes directly inside it. */
export function onTopIn(sketch: Sketch, parent: ShapeId | undefined): Placement {
  return { parent, z: (childrenOf(sketch, parent).at(-1)?.z ?? -1) + 1 };
}

/** Every Shape as drawn, but with the Shapes of `ids` and the Shapes inside them lifted above all the others. */
export function drawOrderLifting(sketch: Sketch, ids: readonly ShapeId[]): readonly SymbolShape[] {
  const lifted = withDescendants(sketch, ids);
  const all = drawOrder(sketch);
  return [...all.filter(({ id }) => !lifted.includes(id)), ...all.filter(({ id }) => lifted.includes(id))];
}
