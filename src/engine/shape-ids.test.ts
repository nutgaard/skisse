import { describe, expect, test } from "vitest";
import { shapes } from "./queries";
import { drawRectangle, newEditor } from "./test-helpers";

describe("Shape IDs", () => {
  test("each new Shape gets the next ID", () => {
    const first = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 10, y: 10 });
    const second = drawRectangle(first, { x: 20, y: 20 }, { x: 30, y: 30 });

    expect(shapes(second).map(({ id }) => id)).toEqual(["shape-1", "shape-2"]);
  });

  test("replaying the same input on the same state gives the same Shapes", () => {
    const start = newEditor();

    const once = drawRectangle(start, { x: 0, y: 0 }, { x: 10, y: 10 });
    const again = drawRectangle(start, { x: 0, y: 0 }, { x: 10, y: 10 });

    expect(shapes(again)).toEqual(shapes(once));
  });
});
