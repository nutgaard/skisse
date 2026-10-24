import type { Shape, ShapeId, Sketch } from "./editor";
import { isArrow } from "./shape-kind";

/** Where a Shape is among the others: in which Container, and where among its siblings. */
export type Placement = Pick<Shape, "parent" | "z">;

/**
 * The Shapes directly inside `parent`, or at the top level for `undefined`, from bottom to top. The Arrows are above
 * the other Shapes, so they never pass behind a Shape they are bound to.
 */
export function childrenOf(sketch: Sketch, parent: ShapeId | undefined): readonly Shape[] {
  const children = Object.values(sketch.shapes)
    .filter((shape) => shape.parent === parent)
    .sort((a, b) => a.z - b.z);
  return [...children.filter((shape) => !isArrow(shape)), ...children.filter(isArrow)];
}

/** Whether `a` and `b` are stacked among each other: in the same Container, and both Arrows or neither. */
export function stackedTogether(a: Shape, b: Shape): boolean {
  return a.parent === b.parent && isArrow(a) === isArrow(b);
}

/** The Shapes stacked with `shape`, itself included, from bottom to top. */
export function stackedWith(sketch: Sketch, shape: Shape): readonly Shape[] {
  return childrenOf(sketch, shape.parent).filter((other) => stackedTogether(other, shape));
}

/** Every Shape inside `parent`, or every Shape for `undefined`, as drawn: each just before its children. */
export function drawOrder(sketch: Sketch, parent?: ShapeId): readonly Shape[] {
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

// `id` and the Containers it is in, from the innermost out, ending with `undefined` for the top level.
function enclosing(sketch: Sketch, id: ShapeId | undefined): readonly (ShapeId | undefined)[] {
  return id === undefined ? [undefined] : [id, ...enclosing(sketch, sketch.shapes[id]?.parent)];
}

/** The innermost of `a`, `b` and the Containers they are in that holds both, or `undefined` for the top level. */
export function innermostCommon(sketch: Sketch, a: ShapeId | undefined, b: ShapeId | undefined): ShapeId | undefined {
  const aroundB = enclosing(sketch, b);
  return enclosing(sketch, a).find((id) => aroundB.includes(id));
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

/**
 * In `parent`, on top of the Shapes directly inside it. Arrows and the other Shapes are stacked apart, so the highest
 * z-position there need not be the last Shape's.
 */
export function onTopIn(sketch: Sketch, parent: ShapeId | undefined): Placement {
  return { parent, z: Math.max(-1, ...childrenOf(sketch, parent).map(({ z }) => z)) + 1 };
}

/** Every Shape as drawn, but with the Shapes of `ids` and the Shapes inside them lifted above all the others. */
export function drawOrderLifting(sketch: Sketch, ids: readonly ShapeId[]): readonly Shape[] {
  const lifted = withDescendants(sketch, ids);
  const all = drawOrder(sketch);
  return [...all.filter(({ id }) => !lifted.includes(id)), ...all.filter(({ id }) => lifted.includes(id))];
}
