import type { ShapeId } from "./editor";

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
