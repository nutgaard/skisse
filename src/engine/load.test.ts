import { describe, expect, test } from "vitest";
import { canRedo, canUndo, sketch } from "./queries";
import {
  apply,
  boundsById,
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
});
