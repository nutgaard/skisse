import { describe, expect, test } from "vitest";
import { currentInteraction, shapes } from "./queries";
import { apply, drawRectangle, newEditor, pointerDown, pointerMove, selectTool } from "./test-helpers";

describe("drawing a rectangle", () => {
  test("dragging with the rectangle tool creates one rectangle matching the drag", () => {
    const state = drawRectangle(newEditor(), { x: 100, y: 50 }, { x: 260, y: 130 });

    expect(shapes(state)).toEqual([
      { id: "shape-1", symbol: "rectangle", bounds: { x: 100, y: 50, width: 160, height: 80 } },
    ]);
  });

  test("dragging up-left gives a rectangle with positive width and height", () => {
    const state = drawRectangle(newEditor(), { x: 260, y: 130 }, { x: 100, y: 50 });

    expect(shapes(state)).toEqual([
      { id: "shape-1", symbol: "rectangle", bounds: { x: 100, y: 50, width: 160, height: 80 } },
    ]);
  });

  test("while dragging, the rectangle being created follows the pointer", () => {
    const state = apply(
      newEditor(),
      selectTool("rectangle"),
      pointerDown({ x: 100, y: 50 }),
      pointerMove({ x: 180, y: 90 }),
      pointerMove({ x: 60, y: 130 }),
    );

    expect(currentInteraction(state)).toEqual({
      kind: "creatingShape",
      symbol: "rectangle",
      bounds: { x: 60, y: 50, width: 40, height: 80 },
    });
  });
});

describe("minimum size when drawing", () => {
  test("a click with the rectangle tool creates a rectangle of the minimum size", () => {
    const state = drawRectangle(newEditor(), { x: 100, y: 50 }, { x: 100, y: 50 });

    expect(shapes(state)).toEqual([
      { id: "shape-1", symbol: "rectangle", bounds: { x: 100, y: 50, width: 10, height: 10 } },
    ]);
  });

  test("a tiny drag up-left creates a minimum-size rectangle up-left of where it started", () => {
    const state = drawRectangle(newEditor(), { x: 100, y: 50 }, { x: 97, y: 48 });

    expect(shapes(state)).toEqual([
      { id: "shape-1", symbol: "rectangle", bounds: { x: 90, y: 40, width: 10, height: 10 } },
    ]);
  });

  test("a drag narrower than the minimum keeps its other side", () => {
    const state = drawRectangle(newEditor(), { x: 100, y: 50 }, { x: 104, y: 130 });

    expect(shapes(state)).toEqual([
      { id: "shape-1", symbol: "rectangle", bounds: { x: 100, y: 50, width: 10, height: 80 } },
    ]);
  });

  test("while dragging, the rectangle being created is shown at least at the minimum size", () => {
    const state = apply(newEditor(), selectTool("rectangle"), pointerDown({ x: 100, y: 50 }), pointerMove({ x: 102, y: 51 }));

    expect(currentInteraction(state)).toEqual({
      kind: "creatingShape",
      symbol: "rectangle",
      bounds: { x: 100, y: 50, width: 10, height: 10 },
    });
  });
});
