import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { shapes } from "./queries";
import { click, drawRectangle, newEditor, press, twoRectangles } from "./test-helpers";

const positions = (state: EditorState) =>
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

  test.each([
    ["ArrowLeft", { x: 100, y: 107 }],
    ["ArrowRight", { x: 110, y: 107 }],
    ["ArrowUp", { x: 103, y: 100 }],
    ["ArrowDown", { x: 103, y: 110 }],
  ])("shift + %s moves a Shape off the grid to the next grid line", (key, expected) => {
    const offGrid = click(drawRectangle(newEditor(), { x: 103, y: 107 }, { x: 203, y: 187 }), { x: 150, y: 140 });

    expect(positions(press(offGrid, key, { shift: true }))).toEqual({ "shape-1": expected });
  });

  test("holding Alt turns snapping off for shift + arrow nudges", () => {
    const offGrid = click(drawRectangle(newEditor(), { x: 103, y: 107 }, { x: 203, y: 187 }), { x: 150, y: 140 });

    expect(positions(press(offGrid, "ArrowRight", { shift: true, alt: true }))).toEqual({
      "shape-1": { x: 113, y: 107 },
    });
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
