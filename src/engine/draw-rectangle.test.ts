import { describe, expect, test } from "vitest";
import { shapes } from "./queries";
import { drawRectangle, newEditor } from "./test-helpers";

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
});
