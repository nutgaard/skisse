import { describe, expect, test } from "vitest";
import { currentInteraction, selection, shapes } from "./queries";
import { apply, drawRectangle, keyDown, newEditor, pointerDown, pointerMove, pointerUp, selectTool } from "./test-helpers";

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

  test("the new rectangle is selected", () => {
    const state = drawRectangle(newEditor(), { x: 100, y: 50 }, { x: 260, y: 130 });

    expect(selection(state)).toEqual(["shape-1"]);
  });

  test("drawing another rectangle selects only the new one", () => {
    const first = drawRectangle(newEditor(), { x: 100, y: 50 }, { x: 260, y: 130 });

    expect(selection(drawRectangle(first, { x: 300, y: 50 }, { x: 400, y: 130 }))).toEqual(["shape-2"]);
  });

  test("cancelling a rectangle with Escape keeps the selection from before", () => {
    const first = drawRectangle(newEditor(), { x: 100, y: 50 }, { x: 260, y: 130 });

    const state = apply(first, pointerDown({ x: 300, y: 50 }), pointerMove({ x: 400, y: 130 }), keyDown("Escape"));

    expect(selection(state)).toEqual(["shape-1"]);
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

describe("grid snapping when drawing", () => {
  test("a drag draws freely, without snapping", () => {
    const state = drawRectangle(newEditor(), { x: 103, y: 107 }, { x: 197, y: 184 });

    expect(shapes(state)[0]?.bounds).toEqual({ x: 103, y: 107, width: 94, height: 77 });
  });

  test("holding Alt snaps both corners of the rectangle to the grid", () => {
    const state = apply(
      newEditor(),
      selectTool("rectangle"),
      pointerDown({ x: 103, y: 107 }, { alt: true }),
      pointerMove({ x: 197, y: 184 }, { alt: true }),
      pointerUp({ x: 197, y: 184 }, { alt: true }),
    );

    expect(shapes(state)[0]?.bounds).toEqual({ x: 100, y: 110, width: 100, height: 70 });
  });

  test("with Alt held, a click creates a minimum-size rectangle on the grid", () => {
    const state = apply(
      newEditor(),
      selectTool("rectangle"),
      pointerDown({ x: 103, y: 107 }, { alt: true }),
      pointerUp({ x: 103, y: 107 }, { alt: true }),
    );

    expect(shapes(state)[0]?.bounds).toEqual({ x: 100, y: 110, width: 10, height: 10 });
  });

  test("with Alt held, a tiny drag still grows the way the pointer went", () => {
    const state = apply(
      newEditor(),
      selectTool("rectangle"),
      pointerDown({ x: 103, y: 107 }, { alt: true }),
      pointerUp({ x: 98, y: 104 }, { alt: true }),
    );

    expect(shapes(state)[0]?.bounds).toEqual({ x: 90, y: 100, width: 10, height: 10 });
  });

  test("pressing Alt while drawing snaps the rectangle being drawn without moving the pointer", () => {
    const state = apply(
      newEditor(),
      selectTool("rectangle"),
      pointerDown({ x: 103, y: 107 }),
      pointerMove({ x: 197, y: 184 }),
      keyDown("Alt", { alt: true }),
    );

    expect(currentInteraction(state)).toEqual({
      kind: "creatingShape",
      symbol: "rectangle",
      bounds: { x: 100, y: 110, width: 100, height: 70 },
    });
  });
});
