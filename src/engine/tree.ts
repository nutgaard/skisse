import type { ShapeId, Sketch, SymbolShape } from "./editor";

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

/** Whether `id` is `ancestor` or somewhere inside it. */
export function isWithin(sketch: Sketch, id: ShapeId, ancestor: ShapeId): boolean {
  const parent = sketch.shapes[id]?.parent;
  return id === ancestor || (parent !== undefined && isWithin(sketch, parent, ancestor));
}

/** The Shapes of `ids` that are not inside another of them, as drawn. */
export function topMost(sketch: Sketch, ids: readonly ShapeId[]): readonly ShapeId[] {
  return drawOrder(sketch)
    .map(({ id }) => id)
    .filter((id) => ids.includes(id) && !ids.some((other) => other !== id && isWithin(sketch, id, other)));
}

/** The Shapes of `ids` and every Shape inside them, as drawn. */
export function withDescendants(sketch: Sketch, ids: readonly ShapeId[]): readonly ShapeId[] {
  return drawOrder(sketch)
    .map(({ id }) => id)
    .filter((id) => ids.some((ancestor) => isWithin(sketch, id, ancestor)));
}

/** The z-position that puts a Shape on top of the Shapes directly inside `parent`. */
export function topZ(sketch: Sketch, parent: ShapeId | undefined): number {
  return (childrenOf(sketch, parent).at(-1)?.z ?? -1) + 1;
}
