import { describe, expect, test } from "vitest";
import type { EditorState, ShapeId } from "./editor";
import { arrows, clipboardText, selection, shapeTree, sketch, type ShapeTree } from "./queries";
import {
  apply,
  boundsById,
  click,
  drawArrow,
  drawRectangle,
  newEditor,
  press,
  redoInput,
  twoRectangles,
  undoInput,
} from "./test-helpers";

// The selection as copied to the system clipboard. Fails when there is nothing to copy.
function copy(state: EditorState): string {
  const text = clipboardText(state);
  if (text === undefined) throw new Error("nothing to copy");
  return text;
}

function paste(state: EditorState, text: string): EditorState {
  return apply(state, { type: "paste", text });
}

// A Shape in the Shape tree, with the Shapes directly inside it.
function shape(id: ShapeId, ...children: readonly ShapeTree[]): ShapeTree {
  return { id, children };
}

function selectAll(state: EditorState): EditorState {
  return press(state, "a", { meta: true });
}

// twoRectangles() with an Arrow, shape-3, from the right side of shape-1 to the left Port of shape-2.
function wiredRectangles(): EditorState {
  return drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 305, y: 140 });
}

describe("copying and pasting", () => {
  test("two Shapes and the Arrow between them paste as an Arrow bound to the copies", () => {
    const all = selectAll(wiredRectangles());

    const state = paste(all, copy(all));

    const pasted = arrows(state).find(({ id }) => selection(state).includes(id));
    expect(pasted?.start.binding?.shape).toBe("shape-4");
    expect(pasted?.end.binding?.shape).toBe("shape-5");
  });

  test("a Shape copied without the Arrows bound to it pastes without them", () => {
    const one = click(wiredRectangles(), { x: 150, y: 140 });

    const state = paste(one, copy(one));

    expect(selection(state)).toEqual(["shape-4"]);
    expect(arrows(state).map(({ id }) => id)).toEqual(["shape-3"]);
  });

  test("an Arrow copied without the Shapes it is bound to pastes with both ends floating", () => {
    const arrowOnly = click(wiredRectangles(), { x: 250, y: 135 });

    const state = paste(arrowOnly, copy(arrowOnly));

    const pasted = arrows(state).find(({ id }) => id === "shape-4");
    expect(pasted?.start).toEqual({ point: { x: 210, y: 140 } });
    expect(pasted?.end).toEqual({ point: { x: 310, y: 150 } });
  });

  test("an Arrow copied with only one of the Shapes it is bound to pastes with both ends floating", () => {
    const shapeAndArrow = click(click(wiredRectangles(), { x: 150, y: 140 }), { x: 250, y: 135 }, { shift: true });

    const state = paste(shapeAndArrow, copy(shapeAndArrow));

    const pasted = arrows(state).find(({ id }) => id === "shape-5");
    expect(pasted?.start).toEqual({ point: { x: 210, y: 140 } });
    expect(pasted?.end).toEqual({ point: { x: 310, y: 150 } });
  });

  test("pasted Shapes get new IDs, land one grid step down and right, and become the selection", () => {
    const all = selectAll(twoRectangles());

    const state = paste(all, copy(all));

    expect(boundsById(state)).toEqual({
      "shape-1": { x: 100, y: 100, width: 100, height: 80 },
      "shape-2": { x: 300, y: 100, width: 100, height: 80 },
      "shape-3": { x: 110, y: 110, width: 100, height: 80 },
      "shape-4": { x: 310, y: 110, width: 100, height: 80 },
    });
    expect(selection(state)).toEqual(["shape-3", "shape-4"]);
  });

  test("Shapes pasted into another Sketch keep the Arrows between them bound to the copies", () => {
    const all = selectAll(wiredRectangles());

    const state = paste(newEditor(), copy(all));

    expect(boundsById(state)).toEqual({
      "shape-1": { x: 110, y: 110, width: 100, height: 80 },
      "shape-2": { x: 310, y: 110, width: 100, height: 80 },
    });
    expect(arrows(state)).toEqual([
      expect.objectContaining({
        id: "shape-3",
        start: expect.objectContaining({ binding: { shape: "shape-1" } }),
        end: expect.objectContaining({ binding: { shape: "shape-2", port: 3 } }),
      }),
    ]);
  });
});

// A VPC shape-1 at (0,0)–(800,600) with two services inside it, shape-2 at (100,100)–(200,180) and shape-3 at
// (400,100)–(500,180), and an Arrow, shape-4, from the right Port of one to the left Port of the other.
function vpcWithWiredServices(): EditorState {
  const vpc = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 800, y: 600 });
  const first = drawRectangle(vpc, { x: 100, y: 100 }, { x: 200, y: 180 });
  const second = drawRectangle(first, { x: 400, y: 100 }, { x: 500, y: 180 });
  return drawArrow(second, { x: 200, y: 140 }, { x: 400, y: 140 });
}

describe("copying and pasting Containers", () => {
  test("a copied Container pastes with its children and the Arrows it owns, bound to the copies", () => {
    const vpc = click(vpcWithWiredServices(), { x: 50, y: 50 });

    const state = paste(vpc, copy(vpc));

    expect(shapeTree(state)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3"), shape("shape-4")),
      shape("shape-5", shape("shape-6"), shape("shape-7"), shape("shape-8")),
    ]);
    expect(arrows(state).find(({ id }) => id === "shape-8")).toEqual(
      expect.objectContaining({
        start: { point: { x: 210, y: 150 }, binding: { shape: "shape-6", port: 1 } },
        end: { point: { x: 410, y: 150 }, binding: { shape: "shape-7", port: 3 } },
      }),
    );
    expect(selection(state)).toEqual(["shape-5"]);
  });

  test("a copied child pastes into the Container it lands in", () => {
    const service = click(vpcWithWiredServices(), { x: 150, y: 120 });

    const state = paste(service, copy(service));

    expect(shapeTree(state)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3"), shape("shape-5"), shape("shape-4")),
    ]);
  });
});

describe("duplicating", () => {
  test("Cmd/Ctrl+D gives the same result as copying and pasting", () => {
    const all = selectAll(wiredRectangles());

    const duplicated = press(all, "d", { meta: true });
    const pasted = paste(all, copy(all));

    expect(sketch(duplicated)).toEqual(sketch(pasted));
    expect(selection(duplicated)).toEqual(selection(pasted));
    expect(sketch(press(all, "d", { ctrl: true }))).toEqual(sketch(duplicated));
  });

  test("duplicating with nothing selected does nothing", () => {
    const state = wiredRectangles();
    const nothing = press(state, "Escape");

    expect(sketch(press(nothing, "d", { meta: true }))).toBe(sketch(state));
  });
});

describe("pasting text that isn't Shapes copied from Skisse", () => {
  test.each([
    ["plain text", "Orders service"],
    ["JSON without the Skisse marker", JSON.stringify({ shapes: [] })],
    ["JSON with the marker but no Shapes", JSON.stringify({ format: "skisse/shapes", shapes: "none" })],
    ["broken JSON", "{"],
  ])("%s does nothing", (_, text) => {
    const before = wiredRectangles();

    const state = paste(before, text);

    expect(sketch(state)).toBe(sketch(before));
    expect(selection(state)).toEqual(selection(before));
  });
});

describe("undoing a paste", () => {
  test("one paste is one undo step", () => {
    const all = selectAll(wiredRectangles());
    const pasted = paste(all, copy(all));

    const undone = apply(pasted, undoInput);

    expect(sketch(undone)).toEqual(sketch(all));
    expect(sketch(apply(undone, redoInput))).toEqual(sketch(pasted));
  });
});
