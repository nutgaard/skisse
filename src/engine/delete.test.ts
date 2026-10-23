import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { selection, shapes } from "./queries";
import { click, drawRectangle, newEditor, press } from "./test-helpers";

// shape-1 at (100,100)–(200,180), shape-2 at (300,100)–(400,180), shape-3 at (500,100)–(600,180).
const threeRectangles = () =>
  [{ x: 100 }, { x: 300 }, { x: 500 }].reduce(
    (state, { x }) => drawRectangle(state, { x, y: 100 }, { x: x + 100, y: 180 }),
    newEditor(),
  );

const ids = (state: EditorState) => shapes(state).map(({ id }) => id);

describe("deleting the selection", () => {
  test.each(["Delete", "Backspace"])("%s removes the selected Shapes", (key) => {
    const twoSelected = click(click(threeRectangles(), { x: 150, y: 140 }), { x: 550, y: 140 }, { shift: true });

    const state = press(twoSelected, key);

    expect(ids(state)).toEqual(["shape-2"]);
    expect(selection(state)).toEqual([]);
  });

  test("deleting with nothing selected removes nothing", () => {
    expect(ids(press(press(threeRectangles(), "Escape"), "Delete"))).toEqual(["shape-1", "shape-2", "shape-3"]);
  });
});
