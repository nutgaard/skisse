import { describe, expect, test } from "vitest";
import { shapes } from "./queries";
import { click, drawRectangle, newEditor, press } from "./test-helpers";

// shape-1 at (100,100)–(200,180), shape-2 at (300,100)–(400,180).
const twoRectangles = () =>
  drawRectangle(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }), { x: 300, y: 100 }, { x: 400, y: 180 });

const positions = (state: ReturnType<typeof newEditor>) =>
  Object.fromEntries(shapes(state).map(({ id, bounds }) => [id, { x: bounds.x, y: bounds.y }]));

describe("nudging the selection with the arrow keys", () => {
  test.each([
    ["ArrowLeft", { x: 99, y: 100 }],
    ["ArrowRight", { x: 101, y: 100 }],
    ["ArrowUp", { x: 100, y: 99 }],
    ["ArrowDown", { x: 100, y: 101 }],
  ])("%s nudges the selection by one unit", (key, expected) => {
    const state = press(click(twoRectangles(), { x: 150, y: 140 }), key);

    expect(positions(state)).toEqual({ "shape-1": expected, "shape-2": { x: 300, y: 100 } });
  });

  test.each([
    ["ArrowLeft", { x: 90, y: 100 }],
    ["ArrowRight", { x: 110, y: 100 }],
    ["ArrowUp", { x: 100, y: 90 }],
    ["ArrowDown", { x: 100, y: 110 }],
  ])("shift + %s nudges the selection by one grid step", (key, expected) => {
    const state = press(click(twoRectangles(), { x: 150, y: 140 }), key, { shift: true });

    expect(positions(state)).toEqual({ "shape-1": expected, "shape-2": { x: 300, y: 100 } });
  });

  test("a nudge moves every selected Shape", () => {
    const bothSelected = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 350, y: 140 }, { shift: true });

    expect(positions(press(bothSelected, "ArrowDown"))).toEqual({
      "shape-1": { x: 100, y: 101 },
      "shape-2": { x: 300, y: 101 },
    });
  });

  test("arrow keys do nothing without a selection", () => {
    expect(positions(press(twoRectangles(), "ArrowDown"))).toEqual({
      "shape-1": { x: 100, y: 100 },
      "shape-2": { x: 300, y: 100 },
    });
  });
});
