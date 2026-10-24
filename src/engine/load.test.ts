import { describe, expect, test } from "vitest";
import type { Sketch } from "./editor";
import { canRedo, canUndo, labelLayout, rendering, shapeStyle, shapeTree, sketch } from "./queries";
import {
  apply,
  boundsById,
  drawArrow,
  drawRectangle,
  newEditor,
  pointerDown,
  pointerMove,
  press,
  selectTool,
  twoRectangles,
} from "./test-helpers";

describe("loading a Sketch", () => {
  test("shows the Shapes of the loaded Sketch", () => {
    expect(boundsById(newEditor(sketch(twoRectangles())))).toEqual({
      "shape-1": { x: 100, y: 100, width: 100, height: 80 },
      "shape-2": { x: 300, y: 100, width: 100, height: 80 },
    });
  });

  test("starts with nothing to undo or redo", () => {
    const withUndone = press(twoRectangles(), "z", { meta: true });
    const loaded = newEditor(sketch(withUndone));

    expect(canUndo(loaded)).toBe(false);
    expect(canRedo(loaded)).toBe(false);
  });

  test("a Shape drawn after loading gets an ID of its own", () => {
    const drawn = drawRectangle(newEditor(sketch(twoRectangles())), { x: 500, y: 100 }, { x: 600, y: 180 });

    expect(boundsById(drawn)).toEqual({
      "shape-1": { x: 100, y: 100, width: 100, height: 80 },
      "shape-2": { x: 300, y: 100, width: 100, height: 80 },
      "shape-3": { x: 500, y: 100, width: 100, height: 80 },
    });
  });

  test("the Sketch to save leaves out a drag that is still going on", () => {
    const dragging = apply(twoRectangles(), selectTool("select"), pointerDown({ x: 150, y: 140 }), pointerMove({ x: 250, y: 240 }));

    expect(boundsById(newEditor(sketch(dragging)))).toEqual(boundsById(twoRectangles()));
  });

  test("a Sketch saved before Shapes had Labels opens with an empty Label on each Shape", () => {
    const saved = {
      shapes: { "shape-1": { id: "shape-1", symbol: "rectangle", bounds: { x: 100, y: 100, width: 100, height: 80 } } },
    } as unknown as Sketch;

    const loaded = newEditor(saved);

    expect(labelLayout(loaded, "shape-1")).toMatchObject({
      text: "",
      alignment: { horizontal: "left", vertical: "top" },
      fontSize: "medium",
    });
    expect(() => rendering(loaded)).not.toThrow();
    expect(canUndo(loaded)).toBe(false);
  });

  test("a Sketch saved before Shapes had colours and strokes opens with the default ones and its font size", () => {
    const saved = {
      shapes: {
        "shape-1": {
          id: "shape-1",
          symbol: "rectangle",
          bounds: { x: 100, y: 100, width: 100, height: 80 },
          label: { text: "API", alignment: { horizontal: "left", vertical: "top" } },
          style: { fontSize: "large" },
        },
      },
    } as unknown as Sketch;

    const loaded = newEditor(saved);

    expect(shapeStyle(loaded, "shape-1")).toEqual({
      strokeColor: "black",
      fill: "transparent",
      strokePattern: "solid",
      strokeWidth: "thin",
      fontSize: "large",
    });
    expect(() => rendering(loaded)).not.toThrow();
    expect(canUndo(loaded)).toBe(false);
  });

  test("a Sketch saved before Containers opens with every Shape at the top level, stacked as saved", () => {
    const shape = (id: string, x: number) => ({
      id,
      symbol: "rectangle",
      bounds: { x, y: 100, width: 100, height: 80 },
      label: { text: "", alignment: { horizontal: "left", vertical: "top" } },
      style: {
        strokeColor: "black",
        fill: "transparent",
        strokePattern: "solid",
        strokeWidth: "thin",
        fontSize: "medium",
      },
    });
    const saved = {
      shapes: { "shape-2": shape("shape-2", 300), "shape-1": shape("shape-1", 100) },
    } as unknown as Sketch;

    const loaded = newEditor(saved);

    expect(shapeTree(loaded)).toEqual([
      { id: "shape-2", children: [] },
      { id: "shape-1", children: [] },
    ]);
    expect(canUndo(loaded)).toBe(false);
  });

  test("a saved Sketch opens with its Containers and stacking order", () => {
    // A Container with a Shape inside it, and a Shape beside it sent to the back.
    const inContainer = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 400, y: 300 });
    const withChild = drawRectangle(inContainer, { x: 100, y: 100 }, { x: 200, y: 180 });
    const drawn = drawRectangle(withChild, { x: 500, y: 0 }, { x: 600, y: 80 });
    const edited = press(drawn, "[");
    const saved = JSON.parse(JSON.stringify(sketch(edited))) as Sketch;

    expect(shapeTree(newEditor(saved))).toEqual([
      { id: "shape-3", children: [] },
      { id: "shape-1", children: [{ id: "shape-2", children: [] }] },
    ]);
  });

  test("a Sketch saved before Arrows belonged to Containers opens with each Arrow in its Container", () => {
    // A Container with two Shapes inside it, and an Arrow between them stored at the top level.
    const container = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 600, y: 300 });
    const first = drawRectangle(container, { x: 100, y: 100 }, { x: 200, y: 180 });
    const second = drawRectangle(first, { x: 400, y: 100 }, { x: 500, y: 180 });
    const drawn = sketch(drawArrow(second, { x: 200, y: 140 }, { x: 400, y: 140 }));
    const arrow = drawn.shapes["shape-4"];
    const saved: Sketch = { shapes: { ...drawn.shapes, "shape-4": { ...arrow!, parent: undefined, z: 1 } } };

    const loaded = newEditor(saved);

    expect(shapeTree(loaded)).toEqual([
      {
        id: "shape-1",
        children: [
          { id: "shape-2", children: [] },
          { id: "shape-3", children: [] },
          { id: "shape-4", children: [] },
        ],
      },
    ]);
    expect(canUndo(loaded)).toBe(false);
  });
});
