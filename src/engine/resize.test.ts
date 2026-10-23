import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { currentInteraction, resizeHandles, shapes } from "./queries";
import {
  apply,
  click,
  drag,
  drawRectangle,
  keyDown,
  newEditor,
  pointerDown,
  pointerMove,
  selectTool,
} from "./test-helpers";

// shape-1 at (100,100)–(200,180): 100 wide, 80 high. Selected.
const selectedRectangle = () => click(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }), { x: 150, y: 140 });

const boundsOfOnlyShape = (state: EditorState) => shapes(state)[0]?.bounds;

describe("resize handles", () => {
  test("a selected Shape has a handle at each corner and in the middle of each side", () => {
    expect(resizeHandles(selectedRectangle())).toEqual([
      { handle: "nw", position: { x: 100, y: 100 } },
      { handle: "n", position: { x: 150, y: 100 } },
      { handle: "ne", position: { x: 200, y: 100 } },
      { handle: "e", position: { x: 200, y: 140 } },
      { handle: "se", position: { x: 200, y: 180 } },
      { handle: "s", position: { x: 150, y: 180 } },
      { handle: "sw", position: { x: 100, y: 180 } },
      { handle: "w", position: { x: 100, y: 140 } },
    ]);
  });

  test("there are no handles without a selection", () => {
    expect(resizeHandles(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }))).toEqual([]);
  });

  test("there are no handles when several Shapes are selected", () => {
    const two = drawRectangle(selectedRectangle(), { x: 300, y: 100 }, { x: 400, y: 180 });

    expect(resizeHandles(click(two, { x: 350, y: 140 }, { shift: true }))).toEqual([]);
  });
});

describe("resizing a Shape", () => {
  test.each([
    ["nw", { x: 100, y: 100 }, { x: 120, y: 130, width: 80, height: 50 }],
    ["n", { x: 150, y: 100 }, { x: 100, y: 130, width: 100, height: 50 }],
    ["ne", { x: 200, y: 100 }, { x: 100, y: 130, width: 120, height: 50 }],
    ["e", { x: 200, y: 140 }, { x: 100, y: 100, width: 120, height: 80 }],
    ["se", { x: 200, y: 180 }, { x: 100, y: 100, width: 120, height: 110 }],
    ["s", { x: 150, y: 180 }, { x: 100, y: 100, width: 100, height: 110 }],
    ["sw", { x: 100, y: 180 }, { x: 120, y: 100, width: 80, height: 110 }],
    ["w", { x: 100, y: 140 }, { x: 120, y: 100, width: 80, height: 80 }],
  ])("dragging the %s handle by (20, 30) moves only its edges", (_, handle, expected) => {
    const state = drag(selectedRectangle(), handle, { x: handle.x + 20, y: handle.y + 30 });

    expect(boundsOfOnlyShape(state)).toEqual(expected);
  });

  test("a handle can be grabbed a few pixels away from its centre", () => {
    const state = drag(selectedRectangle(), { x: 204, y: 184 }, { x: 224, y: 214 });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 120, height: 110 });
  });

  test("while resizing, the Shape is shown at its new size", () => {
    const state = apply(
      selectedRectangle(),
      selectTool("select"),
      pointerDown({ x: 200, y: 180 }),
      pointerMove({ x: 220, y: 210 }),
    );

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 120, height: 110 });
    expect(currentInteraction(state)).toEqual({ kind: "resizing", handle: "se" });
  });

  test("a resize brought back to where it started still follows the pointer", () => {
    const state = apply(
      selectedRectangle(),
      pointerDown({ x: 200, y: 180 }),
      pointerMove({ x: 260, y: 260 }),
      pointerMove({ x: 202, y: 181 }, { alt: true }),
    );

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 102, height: 81 });
  });

  test("Escape cancels a resize and restores the Shape's size", () => {
    const state = apply(
      selectedRectangle(),
      pointerDown({ x: 200, y: 180 }),
      pointerMove({ x: 220, y: 210 }),
      keyDown("Escape"),
      pointerMove({ x: 260, y: 260 }),
    );

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 100, height: 80 });
    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });
});

describe("grid snapping while resizing", () => {
  test("the moved edges snap to the grid", () => {
    const state = drag(selectedRectangle(), { x: 200, y: 180 }, { x: 223, y: 197 });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 120, height: 100 });
  });

  test("holding Alt turns snapping off during the resize", () => {
    const state = drag(selectedRectangle(), { x: 200, y: 180 }, { x: 223, y: 197 }, { alt: true });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 123, height: 97 });
  });

  test("grabbing a handle of a Shape off the grid without dragging does not resize it", () => {
    const offGrid = click(drawRectangle(newEditor(), { x: 103, y: 107 }, { x: 203, y: 187 }), { x: 150, y: 140 });

    const state = apply(offGrid, pointerDown({ x: 203, y: 187 }), pointerMove({ x: 204, y: 188 }));

    expect(boundsOfOnlyShape(state)).toEqual({ x: 103, y: 107, width: 100, height: 80 });
  });
});

describe("keeping the aspect ratio with shift", () => {
  test("a corner handle grows both sides by the larger change", () => {
    const state = drag(selectedRectangle(), { x: 200, y: 180 }, { x: 250, y: 190 }, { shift: true });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 150, height: 120 });
  });

  test("the opposite corner stays in place", () => {
    const state = drag(selectedRectangle(), { x: 100, y: 100 }, { x: 50, y: 100 }, { shift: true });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 50, y: 60, width: 150, height: 120 });
  });

  test("a side handle scales the other side around the Shape's middle", () => {
    const state = drag(selectedRectangle(), { x: 200, y: 140 }, { x: 300, y: 140 }, { shift: true });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 60, width: 200, height: 160 });
  });
});

describe("minimum size", () => {
  test("dragging a handle past the opposite side stops at the minimum size", () => {
    const state = drag(selectedRectangle(), { x: 200, y: 180 }, { x: 50, y: 50 });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 10, height: 10 });
  });

  test("the minimum size holds from the top-left handle too", () => {
    const state = drag(selectedRectangle(), { x: 100, y: 100 }, { x: 300, y: 300 });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 190, y: 170, width: 10, height: 10 });
  });

  test("keeping the aspect ratio, the shorter side stops at the minimum size", () => {
    const state = drag(selectedRectangle(), { x: 200, y: 180 }, { x: 50, y: 50 }, { shift: true });

    expect(boundsOfOnlyShape(state)).toEqual({ x: 100, y: 100, width: 12.5, height: 10 });
  });
});
