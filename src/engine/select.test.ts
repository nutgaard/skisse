import { describe, expect, test } from "vitest";
import { currentInteraction, selection, shapes } from "./queries";
import {
  apply,
  click,
  drag,
  drawRectangle,
  keyDown,
  newEditor,
  pointerCancel,
  pointerDown,
  pointerMove,
  pointerUp,
  press,
  selectTool,
} from "./test-helpers";

// Two rectangles side by side: shape-1 at (100,100)–(200,180), shape-2 at (300,100)–(400,180).
const twoRectangles = () =>
  drawRectangle(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }), { x: 300, y: 100 }, { x: 400, y: 180 });

describe("selecting Shapes", () => {
  test("nothing is selected in a new editor", () => {
    expect(selection(newEditor())).toEqual([]);
  });

  test("clicking a Shape selects it", () => {
    expect(selection(click(twoRectangles(), { x: 150, y: 140 }))).toEqual(["shape-1"]);
  });

  test("clicking another Shape selects only that Shape", () => {
    const state = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 350, y: 140 });

    expect(selection(state)).toEqual(["shape-2"]);
  });

  test("clicking empty space clears the selection", () => {
    const state = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 250, y: 300 });

    expect(selection(state)).toEqual([]);
  });

  test("shift-clicking a Shape adds it to the selection", () => {
    const state = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 350, y: 140 }, { shift: true });

    expect(selection(state)).toEqual(["shape-1", "shape-2"]);
  });

  test("shift-clicking a selected Shape removes it from the selection", () => {
    const bothSelected = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 350, y: 140 }, { shift: true });

    expect(selection(click(bothSelected, { x: 150, y: 140 }, { shift: true }))).toEqual(["shape-2"]);
  });

  test("shift-clicking empty space keeps the selection", () => {
    const state = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 250, y: 300 }, { shift: true });

    expect(selection(state)).toEqual(["shape-1"]);
  });

  test("the topmost Shape is selected where Shapes overlap", () => {
    const overlapping = drawRectangle(twoRectangles(), { x: 150, y: 120 }, { x: 250, y: 160 });

    expect(selection(click(overlapping, { x: 170, y: 140 }))).toEqual(["shape-3"]);
  });
});

describe("selecting Shapes with a box", () => {
  test("dragging a box on empty space selects the Shapes inside it", () => {
    const state = drag(twoRectangles(), { x: 50, y: 50 }, { x: 450, y: 250 });

    expect(selection(state)).toEqual(["shape-1", "shape-2"]);
  });

  test("Shapes only partly inside the box are not selected", () => {
    const state = drag(twoRectangles(), { x: 50, y: 50 }, { x: 350, y: 250 });

    expect(selection(state)).toEqual(["shape-1"]);
  });

  test("the box can be dragged in any direction", () => {
    const state = drag(twoRectangles(), { x: 450, y: 250 }, { x: 250, y: 50 });

    expect(selection(state)).toEqual(["shape-2"]);
  });

  test("a box replaces the selection", () => {
    const state = drag(click(twoRectangles(), { x: 150, y: 140 }), { x: 250, y: 50 }, { x: 450, y: 250 });

    expect(selection(state)).toEqual(["shape-2"]);
  });

  test("a shift-dragged box adds to the selection", () => {
    const state = drag(click(twoRectangles(), { x: 150, y: 140 }), { x: 250, y: 50 }, { x: 450, y: 250 }, { shift: true });

    expect(selection(state)).toEqual(["shape-1", "shape-2"]);
  });

  test("while dragging, the box is shown and the Shapes inside it are selected", () => {
    const state = apply(
      twoRectangles(),
      selectTool("select"),
      pointerDown({ x: 450, y: 250 }),
      pointerMove({ x: 250, y: 50 }),
    );

    expect(currentInteraction(state)).toEqual({
      kind: "selectingBox",
      bounds: { x: 250, y: 50, width: 200, height: 200 },
    });
    expect(selection(state)).toEqual(["shape-2"]);
  });

  test("after the box is released, nothing is being dragged", () => {
    const state = drag(twoRectangles(), { x: 50, y: 50 }, { x: 450, y: 250 });

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });
});

describe("select all", () => {
  test("Cmd+A selects every Shape", () => {
    expect(selection(press(twoRectangles(), "a", { meta: true }))).toEqual(["shape-1", "shape-2"]);
  });

  test("Ctrl+A selects every Shape", () => {
    expect(selection(press(twoRectangles(), "a", { ctrl: true }))).toEqual(["shape-1", "shape-2"]);
  });

  test("A without Cmd or Ctrl does not select anything", () => {
    expect(selection(press(twoRectangles(), "a"))).toEqual([]);
  });
});

describe("Escape", () => {
  test("Escape clears the selection", () => {
    expect(selection(press(click(twoRectangles(), { x: 150, y: 140 }), "Escape"))).toEqual([]);
  });

  test("Escape cancels a box selection and restores the selection from before it", () => {
    const state = apply(
      click(twoRectangles(), { x: 150, y: 140 }),
      pointerDown({ x: 250, y: 50 }),
      pointerMove({ x: 450, y: 250 }),
      keyDown("Escape"),
    );

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
    expect(selection(state)).toEqual(["shape-1"]);
  });

  test("the pointer moving on after Escape no longer changes the selection", () => {
    const state = apply(
      twoRectangles(),
      selectTool("select"),
      pointerDown({ x: 50, y: 50 }),
      keyDown("Escape"),
      pointerMove({ x: 450, y: 250 }),
      pointerUp({ x: 450, y: 250 }),
    );

    expect(selection(state)).toEqual([]);
  });

  test("Escape cancels drawing a Shape", () => {
    const state = apply(
      newEditor(),
      selectTool("rectangle"),
      pointerDown({ x: 100, y: 100 }),
      pointerMove({ x: 200, y: 200 }),
      keyDown("Escape"),
      pointerUp({ x: 200, y: 200 }),
    );

    expect(shapes(state)).toEqual([]);
    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });

  test("a cancelled pointer cancels the gesture like Escape", () => {
    const state = apply(
      click(twoRectangles(), { x: 150, y: 140 }),
      pointerDown({ x: 250, y: 50 }),
      pointerMove({ x: 450, y: 250 }),
      pointerCancel({ x: 450, y: 250 }),
    );

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
    expect(selection(state)).toEqual(["shape-1"]);
  });
});
