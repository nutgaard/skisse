import { describe, expect, test } from "vitest";
import type { EditorState, ShapeId } from "./editor";
import { exportSvg } from "./export";
import { fixedWidthTextMeasurer } from "./fakes";
import { rendering, shapes, sketch } from "./queries";
import { svgText } from "./svg";
import {
  apply,
  click,
  drag,
  drawRectangle,
  keyDown,
  newEditor,
  pointerDown,
  pointerMove,
  press,
  selectTool,
} from "./test-helpers";

// shape-1 to shape-4, each 100 × 80, side by side along y = 100 from x = 100, 300, 500 and 700.
function fourRectangles(): EditorState {
  return [100, 300, 500, 700].reduce(
    (state, x) => drawRectangle(state, { x, y: 100 }, { x: x + 100, y: 180 }),
    newEditor(),
  );
}

// Selects the Shapes of fourRectangles() by number.
function select(state: EditorState, ...numbers: readonly number[]): EditorState {
  return numbers.reduce(
    (selecting, number, index) => click(selecting, { x: number * 200 - 50, y: 140 }, { shift: index > 0 }),
    press(state, "Escape"),
  );
}

// The Shapes in SVG text, in the order it draws them.
function shapesIn(svg: string): readonly (string | undefined)[] {
  return [...svg.matchAll(/data-shape="([^"]+)"/g)].map(([, id]) => id);
}

function drawn(state: EditorState): readonly ShapeId[] {
  return shapes(state).map(({ id }) => id);
}

describe("stacking order", () => {
  test("Shapes are drawn in the order they were made", () => {
    expect(drawn(fourRectangles())).toEqual(["shape-1", "shape-2", "shape-3", "shape-4"]);
  });

  test("] brings the selection to the front", () => {
    const state = press(select(fourRectangles(), 2), "]");

    expect(drawn(state)).toEqual(["shape-1", "shape-3", "shape-4", "shape-2"]);
  });

  test("[ sends the selection to the back", () => {
    const state = press(select(fourRectangles(), 3), "[");

    expect(drawn(state)).toEqual(["shape-3", "shape-1", "shape-2", "shape-4"]);
  });

  test.each([{ meta: true }, { ctrl: true }])("Cmd/Ctrl + ] brings the selection one step forward", (modifiers) => {
    const state = press(select(fourRectangles(), 2), "]", modifiers);

    expect(drawn(state)).toEqual(["shape-1", "shape-3", "shape-2", "shape-4"]);
  });

  test.each([{ meta: true }, { ctrl: true }])("Cmd/Ctrl + [ sends the selection one step back", (modifiers) => {
    const state = press(select(fourRectangles(), 3), "[", modifiers);

    expect(drawn(state)).toEqual(["shape-1", "shape-3", "shape-2", "shape-4"]);
  });

  test("several selected Shapes keep their order among themselves", () => {
    const toFront = press(select(fourRectangles(), 3, 1), "]");
    const toBack = press(select(fourRectangles(), 4, 2), "[");

    expect(drawn(toFront)).toEqual(["shape-2", "shape-4", "shape-1", "shape-3"]);
    expect(drawn(toBack)).toEqual(["shape-2", "shape-4", "shape-1", "shape-3"]);
  });

  test("several selected Shapes step forward past the next Shape above them, together", () => {
    const state = press(select(fourRectangles(), 1, 2), "]", { meta: true });

    expect(drawn(state)).toEqual(["shape-3", "shape-1", "shape-2", "shape-4"]);
  });

  test("several selected Shapes step back past the next Shape below them, together", () => {
    const state = press(select(fourRectangles(), 3, 4), "[", { meta: true });

    expect(drawn(state)).toEqual(["shape-1", "shape-3", "shape-4", "shape-2"]);
  });

  test("the front Shape stepping forward stays in front", () => {
    const state = press(select(fourRectangles(), 4), "]", { meta: true });

    expect(drawn(state)).toEqual(["shape-1", "shape-2", "shape-3", "shape-4"]);
  });

  test("a reorder undoes as one step", () => {
    const selected = select(fourRectangles(), 2);
    const reordered = press(selected, "]");

    expect(drawn(press(reordered, "z", { meta: true }))).toEqual(drawn(fourRectangles()));
  });

  test("a reorder that changes nothing adds no undo step", () => {
    const reordered = press(select(fourRectangles(), 4), "]");

    const undone = press(reordered, "z", { meta: true });

    expect(drawn(undone)).toEqual(["shape-1", "shape-2", "shape-3"]);
  });

  test("with nothing selected, nothing is reordered", () => {
    const state = press(press(fourRectangles(), "Escape"), "[");

    expect(drawn(state)).toEqual(drawn(fourRectangles()));
  });
});

// A Container at (0,0)–(1000,400), drawn around fourRectangles(), so that they are its children, and shape-6 a
// rectangle outside it at (1100,100)–(1200,180), drawn after it.
function inContainer(): EditorState {
  return drawRectangle(
    drawRectangle(fourRectangles(), { x: 0, y: 0 }, { x: 1000, y: 400 }),
    { x: 1100, y: 100 },
    { x: 1200, y: 180 },
  );
}

describe("stacking order with Containers", () => {
  test("a Container is drawn below its children, even when drawn after them", () => {
    expect(drawn(inContainer())).toEqual(["shape-5", "shape-1", "shape-2", "shape-3", "shape-4", "shape-6"]);
  });

  test("on screen and in an export, a Container is drawn below its children", () => {
    const order = ["shape-5", "shape-1", "shape-2", "shape-3", "shape-4", "shape-6"];

    expect(shapesIn(svgText(rendering(inContainer())))).toEqual(order);
    expect(shapesIn(exportSvg(sketch(inContainer()), fixedWidthTextMeasurer) ?? "")).toEqual(order);
  });

  test("bringing a child to the front only brings it in front of its siblings", () => {
    const state = press(select(inContainer(), 1), "]");

    expect(drawn(state)).toEqual(["shape-5", "shape-2", "shape-3", "shape-4", "shape-1", "shape-6"]);
  });

  test("bringing a Container to the front brings its children along, still above it", () => {
    const state = press(click(inContainer(), { x: 50, y: 50 }), "]");

    expect(drawn(state)).toEqual(["shape-6", "shape-5", "shape-1", "shape-2", "shape-3", "shape-4"]);
  });

  test("sending a child to the back keeps it above its Container", () => {
    const state = press(select(inContainer(), 3), "[");

    expect(drawn(state)).toEqual(["shape-5", "shape-3", "shape-1", "shape-2", "shape-4", "shape-6"]);
  });

  test("a child and a Shape outside its Container are each reordered among their own siblings", () => {
    const state = press(click(select(inContainer(), 4), { x: 1150, y: 140 }, { shift: true }), "[");

    expect(drawn(state)).toEqual(["shape-6", "shape-5", "shape-4", "shape-1", "shape-2", "shape-3"]);
  });

  test("a Shape dropped into a Container goes in front of the Shapes already there", () => {
    const atBack = press(click(inContainer(), { x: 1150, y: 140 }), "[");

    const state = drag(atBack, { x: 1150, y: 140 }, { x: 950, y: 300 });

    expect(drawn(state)).toEqual(["shape-5", "shape-1", "shape-2", "shape-3", "shape-4", "shape-6"]);
  });

  test("a Shape dropped out of a Container goes in front of the Shapes at the top level", () => {
    const outside = drawRectangle(inContainer(), { x: 1100, y: 300 }, { x: 1200, y: 380 });
    const state = drag(outside, { x: 150, y: 140 }, { x: 1150, y: 540 });

    expect(drawn(state)).toEqual(["shape-5", "shape-2", "shape-3", "shape-4", "shape-6", "shape-7", "shape-1"]);
  });
});

// A Container shape-1 at (0,0)–(400,300) with shape-2 inside it at (100,100)–(200,180), and a Container shape-3
// beside it at (500,0)–(900,300), drawn above it.
function twoContainers(): EditorState {
  const container = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 400, y: 300 });
  const withChild = drawRectangle(container, { x: 100, y: 100 }, { x: 200, y: 180 });
  return drawRectangle(withChild, { x: 500, y: 0 }, { x: 900, y: 300 });
}

function dragging(state: EditorState, from: { x: number; y: number }, to: { x: number; y: number }): EditorState {
  return apply(state, selectTool("select"), pointerDown(from), pointerMove(to));
}

describe("stacking order while dragging", () => {
  test("a Shape being dragged is drawn in front of everything", () => {
    const state = dragging(twoContainers(), { x: 150, y: 140 }, { x: 700, y: 150 });

    expect(shapesIn(svgText(rendering(state)))).toEqual(["shape-1", "shape-3", "shape-2"]);
  });

  test("a Container being dragged is drawn in front of everything, with the Shapes inside it above it", () => {
    const state = dragging(twoContainers(), { x: 20, y: 20 }, { x: 520, y: 20 });

    expect(shapesIn(svgText(rendering(state)))).toEqual(["shape-3", "shape-1", "shape-2"]);
  });

  test("a cancelled drag puts the Shape back in its place in the stacking order", () => {
    const state = apply(dragging(twoContainers(), { x: 150, y: 140 }, { x: 700, y: 150 }), keyDown("Escape"));

    expect(shapesIn(svgText(rendering(state)))).toEqual(["shape-1", "shape-2", "shape-3"]);
  });

  test("a Shape dragged and dropped back in its Container returns to its place in the stacking order", () => {
    const state = drag(twoContainers(), { x: 150, y: 140 }, { x: 160, y: 150 });

    expect(shapesIn(svgText(rendering(state)))).toEqual(["shape-1", "shape-2", "shape-3"]);
  });
});

