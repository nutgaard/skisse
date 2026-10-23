import { describe, expect, test } from "vitest";
import { currentInteraction, selection } from "./queries";
import {
  apply,
  boundsById,
  click,
  drag,
  drawRectangle,
  keyDown,
  newEditor,
  pointerDown,
  pointerMove,
  selectTool,
  twoRectangles,
} from "./test-helpers";

describe("dragging Shapes", () => {
  test("dragging a Shape moves it by the drag", () => {
    const state = drag(twoRectangles(), { x: 150, y: 140 }, { x: 200, y: 170 });

    expect(boundsById(state)).toEqual({
      "shape-1": { x: 150, y: 130, width: 100, height: 80 },
      "shape-2": { x: 300, y: 100, width: 100, height: 80 },
    });
  });

  test("dragging an unselected Shape selects it", () => {
    const state = drag(click(twoRectangles(), { x: 350, y: 140 }), { x: 150, y: 140 }, { x: 200, y: 170 });

    expect(selection(state)).toEqual(["shape-1"]);
  });

  test("dragging one of several selected Shapes moves them all", () => {
    const bothSelected = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 350, y: 140 }, { shift: true });

    const state = drag(bothSelected, { x: 150, y: 140 }, { x: 170, y: 190 });

    expect(boundsById(state)).toEqual({
      "shape-1": { x: 120, y: 150, width: 100, height: 80 },
      "shape-2": { x: 320, y: 150, width: 100, height: 80 },
    });
    expect(selection(state)).toEqual(["shape-1", "shape-2"]);
  });

  test("while dragging, the Shapes are shown where they are being moved", () => {
    const state = apply(
      twoRectangles(),
      selectTool("select"),
      pointerDown({ x: 150, y: 140 }),
      pointerMove({ x: 200, y: 170 }),
    );

    expect(boundsById(state)["shape-1"]).toEqual({ x: 150, y: 130, width: 100, height: 80 });
    expect(currentInteraction(state)).toEqual({ kind: "moving" });
  });

  test("Escape cancels a drag and puts the Shapes back", () => {
    const state = apply(
      twoRectangles(),
      selectTool("select"),
      pointerDown({ x: 150, y: 140 }),
      pointerMove({ x: 200, y: 170 }),
      keyDown("Escape"),
      pointerMove({ x: 250, y: 200 }),
    );

    expect(boundsById(state)["shape-1"]).toEqual({ x: 100, y: 100, width: 100, height: 80 });
    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });

  test("shift-clicking a selected Shape to remove it does not start a drag", () => {
    const state = apply(
      click(twoRectangles(), { x: 150, y: 140 }),
      pointerDown({ x: 150, y: 140 }, { shift: true }),
      pointerMove({ x: 200, y: 170 }, { shift: true }),
    );

    expect(boundsById(state)["shape-1"]).toEqual({ x: 100, y: 100, width: 100, height: 80 });
    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });
});

describe("grid snapping while dragging", () => {
  // shape-1 at (103,107)–(203,187), off the grid.
  const offGrid = () => drawRectangle(newEditor(), { x: 103, y: 107 }, { x: 203, y: 187 });

  test("a drag snaps the moved Shape to the grid", () => {
    const state = drag(twoRectangles(), { x: 150, y: 140 }, { x: 173, y: 157 });

    expect(boundsById(state)["shape-1"]).toEqual({ x: 120, y: 120, width: 100, height: 80 });
  });

  test("a Shape off the grid lands on the grid when dragged", () => {
    const state = drag(offGrid(), { x: 150, y: 140 }, { x: 170, y: 160 });

    expect(boundsById(state)["shape-1"]).toEqual({ x: 120, y: 130, width: 100, height: 80 });
  });

  test("several Shapes snap together and keep their distance to each other", () => {
    const withSecond = drawRectangle(offGrid(), { x: 305, y: 100 }, { x: 405, y: 180 });
    const bothSelected = click(click(withSecond, { x: 150, y: 140 }), { x: 350, y: 140 }, { shift: true });

    const state = drag(bothSelected, { x: 150, y: 140 }, { x: 170, y: 160 });

    expect(boundsById(state)).toEqual({
      "shape-1": { x: 120, y: 127, width: 100, height: 80 },
      "shape-2": { x: 322, y: 120, width: 100, height: 80 },
    });
  });

  test("clicking a Shape off the grid does not move it", () => {
    const state = apply(offGrid(), selectTool("select"), pointerDown({ x: 150, y: 140 }), pointerMove({ x: 151, y: 141 }));

    expect(boundsById(state)["shape-1"]).toEqual({ x: 103, y: 107, width: 100, height: 80 });
  });

  test("holding Alt turns snapping off during the drag", () => {
    const state = drag(twoRectangles(), { x: 150, y: 140 }, { x: 173, y: 157 }, { alt: true });

    expect(boundsById(state)["shape-1"]).toEqual({ x: 123, y: 117, width: 100, height: 80 });
  });
});
