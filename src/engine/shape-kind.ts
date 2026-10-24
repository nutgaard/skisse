import type { Arrow } from "./arrow";
import type { Shape, SymbolShape } from "./editor";

/** Whether the Shape is an Arrow. Every other Shape is made from a Symbol. */
export function isArrow(shape: Shape): shape is Arrow {
  return "routing" in shape;
}

/** Whether the Shape is made from a Symbol, which every Shape but an Arrow is. */
export function isSymbolShape(shape: Shape): shape is SymbolShape {
  return !isArrow(shape);
}
