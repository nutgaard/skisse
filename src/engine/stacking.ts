import type { ShapeId, Sketch } from "./editor";
import { stackedWith } from "./tree";

/** A new order for siblings, given from bottom to top, that moves the selected ones. */
export type Reorder = (siblings: readonly ShapeId[], isSelected: (id: ShapeId) => boolean) => readonly ShapeId[];

/** The selected Shapes on top, in the order they had. */
export const bringToFront: Reorder = (siblings, isSelected) => [
  ...siblings.filter((id) => !isSelected(id)),
  ...siblings.filter(isSelected),
];

/** The selected Shapes at the bottom, in the order they had. */
export const sendToBack: Reorder = (siblings, isSelected) => [
  ...siblings.filter(isSelected),
  ...siblings.filter((id) => !isSelected(id)),
];

/**
 * Each selected Shape below the Shape just below it, unless that one is selected too. Going up from the bottom,
 * selected Shapes next to each other move down together.
 */
export const sendBackward: Reorder = (siblings, isSelected) =>
  siblings.reduce<readonly ShapeId[]>((order, id) => {
    const below = order.at(-1);
    return isSelected(id) && below !== undefined && !isSelected(below)
      ? [...order.slice(0, -1), id, below]
      : [...order, id];
  }, []);

/** Each selected Shape above the Shape just above it, unless that one is selected too: sending backward upside down. */
export const bringForward: Reorder = (siblings, isSelected) =>
  sendBackward(siblings.toReversed(), isSelected).toReversed();

/**
 * The Sketch with the Shapes of `ids` reordered by `reorder` among the Shapes stacked with them only, so a child stays
 * inside its Container, above it, a Container takes its children along, and Arrows stay above the other Shapes.
 * Shapes already in the new order keep their z-positions.
 */
export function restack(sketch: Sketch, ids: readonly ShapeId[], reorder: Reorder): Sketch {
  const stacks = ids.flatMap((id) => {
    const shape = sketch.shapes[id];
    return shape ? [stackedWith(sketch, shape).map((stacked) => stacked.id)] : [];
  });
  // Each stack once, by the Shape at its bottom.
  const distinct = stacks.filter((stack, index) => stacks.findIndex((other) => other[0] === stack[0]) === index);
  return distinct.reduce((restacked, stack) => {
    const order = reorder(stack, (id) => ids.includes(id));
    if (order.every((id, index) => id === stack[index])) return restacked;
    return {
      ...restacked,
      shapes: {
        ...restacked.shapes,
        ...Object.fromEntries(
          order.flatMap((id, z) => {
            const shape = restacked.shapes[id];
            return shape ? [[id, { ...shape, z }]] : [];
          }),
        ),
      },
    };
  }, sketch);
}
