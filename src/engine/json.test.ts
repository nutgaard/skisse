import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { exportJson, importJson, type Migration } from "./json";
import { sketch } from "./queries";
import { apply, drawArrow, drawLabelled, drawRectangle, newEditor, press, twoRectangles } from "./test-helpers";

// A Container labelled Backend with a rectangle, shape-2, inside it, and an Arrow, shape-4, from the rectangle's right
// Port to the left Port of a styled cloud, shape-3, outside the Container.
function diagram(): EditorState {
  const container = drawLabelled(newEditor(), "rectangle", { x: 0, y: 0 }, { x: 400, y: 300 }, "Backend");
  const inside = drawRectangle(press(container, "Escape"), { x: 100, y: 100 }, { x: 200, y: 180 });
  const styled = apply(press(inside, "Escape"), { type: "changeStyle", style: { strokeColor: "blue", fill: "red" } });
  const cloud = drawLabelled(styled, "cloud", { x: 500, y: 100 }, { x: 640, y: 180 }, "Internet");
  return press(drawArrow(press(cloud, "Escape"), { x: 200, y: 140 }, { x: 500, y: 140 }), "Escape");
}

describe("JSON export and import", () => {
  test("a Sketch exported and imported again is the same Sketch", () => {
    const exported = sketch(diagram());

    expect(importJson(exportJson(exported))).toEqual({ sketch: exported });
  });
});

describe("format versions", () => {
  // Made-up earlier format versions, each with the migration to the next: the first kept Shapes as a list under
  // `elements`, the second keyed them by ID under `elements`, and the third, the current one here, is the real one.
  const migrations: readonly Migration[] = [
    (document) => ({
      ...document,
      elements: Object.fromEntries((document.elements as { id: string }[]).map((shape) => [shape.id, shape])),
    }),
    ({ elements, ...document }) => ({ ...document, shapes: elements }),
  ];
  const exported = sketch(twoRectangles());

  test("a file in the first format version is migrated through every version since", () => {
    const text = JSON.stringify({ format: "skisse/sketch", version: 1, elements: Object.values(exported.shapes) });

    expect(importJson(text, migrations)).toEqual({ sketch: exported });
  });

  test("a file in a later format version is migrated only through the versions after it", () => {
    const text = JSON.stringify({ format: "skisse/sketch", version: 2, elements: exported.shapes });

    expect(importJson(text, migrations)).toEqual({ sketch: exported });
  });

  test("a file in the current format version is not migrated", () => {
    const text = JSON.stringify({ format: "skisse/sketch", version: 3, shapes: exported.shapes });

    expect(importJson(text, migrations)).toEqual({ sketch: exported });
  });

  test("a file from a newer version of Skisse is rejected", () => {
    const text = JSON.stringify({ format: "skisse/sketch", version: 4, shapes: exported.shapes });

    expect(importJson(text, migrations)).toEqual({
      error:
        "The file is in format version 4, from a newer Skisse than this one, which reads up to version 3. " +
        "Reload the page to update Skisse.",
    });
  });

  test.each([
    ["without a format version", { format: "skisse/sketch", shapes: {} }],
    ["with a format version that isn't a whole number", { format: "skisse/sketch", version: 1.5, shapes: {} }],
    ["with a format version before the first", { format: "skisse/sketch", version: 0, shapes: {} }],
  ])("a file %s is rejected", (_, document) => {
    expect(importJson(JSON.stringify(document), migrations)).toEqual({
      error: "The file has no valid format version.",
    });
  });
});

describe("importing a file that isn't a Sketch", () => {
  test("text that isn't JSON is rejected", () => {
    expect(importJson('{"format": "skisse/sketch", ')).toEqual({ error: "The file isn't valid JSON." });
  });

  test.each([
    ["a JSON value that isn't an object", "[1, 2, 3]"],
    ["an object without the format mark", '{"version": 1, "shapes": {}}'],
    ["Shapes copied from Skisse", '{"format": "skisse/shapes", "shapes": []}'],
  ])("%s is rejected", (_, text) => {
    expect(importJson(text)).toEqual({ error: "The file isn't a Skisse Sketch." });
  });
});

type ShapeJson = Readonly<Record<string, unknown>>;

// The diagram as a JSON file, but with `change` made to the Shape `id` in it.
function changedShape(id: string, change: (shape: ShapeJson) => unknown): string {
  const document = JSON.parse(exportJson(sketch(diagram()))) as { shapes: Record<string, ShapeJson> };
  const changed = change(document.shapes[id] ?? {});
  return JSON.stringify({ ...document, shapes: { ...document.shapes, [id]: changed } });
}

describe("importing a Sketch with Shapes that are not as Skisse writes them", () => {
  test("a file without Shapes is rejected", () => {
    expect(importJson(JSON.stringify({ format: "skisse/sketch", version: 1 }))).toEqual({
      error: "The file has no Shapes.",
    });
  });

  test.each<[string, string, (shape: ShapeJson) => unknown, string]>([
    ["a Shape that isn't an object", "shape-2", () => 42, "it should be an object"],
    ["a Shape without Bounds", "shape-2", ({ bounds, ...shape }) => shape, "bounds is missing"],
    [
      "a Shape with Bounds of the wrong type",
      "shape-2",
      (shape) => ({ ...shape, bounds: { x: 100, y: 100, width: "wide", height: 80 } }),
      "bounds.width should be a number",
    ],
    [
      "a Shape with a Label of the wrong type",
      "shape-3",
      (shape) => ({ ...shape, label: { text: 42, alignment: { horizontal: "left", vertical: "top" } } }),
      "label.text should be text",
    ],
    [
      "a Shape with a colour that isn't in the palette",
      "shape-3",
      (shape) => ({ ...shape, style: { ...(shape.style as object), fill: "pink" } }),
      'style.fill "pink" should be one of "transparent", "black", "red", "orange", "yellow", "green", "blue", "violet"',
    ],
    ["a Shape without a Symbol", "shape-3", ({ symbol, ...shape }) => shape, "symbol is missing"],
    [
      "a Shape made from an unknown Symbol",
      "shape-3",
      (shape) => ({ ...shape, symbol: "hexagon" }),
      'symbol "hexagon" isn\'t a known Symbol',
    ],
    ["an Arrow without heads", "shape-4", ({ heads, ...shape }) => shape, "heads is missing"],
    [
      "an Arrow with an end of an unknown kind",
      "shape-4",
      (shape) => ({ ...shape, start: { kind: "glued", shape: "shape-2" } }),
      'start.kind "glued" should be one of "port", "outline", "floating"',
    ],
    [
      "an Arrow with its Label past its end",
      "shape-4",
      (shape) => ({ ...shape, label: { text: "", along: 2 } }),
      "label.along should be a number from 0 to 1",
    ],
  ])("%s is rejected", (_, id, change, problem) => {
    expect(importJson(changedShape(id, change))).toEqual({
      error: `Shape "${id}" in the file is invalid: ${problem}.`,
    });
  });
});

describe("importing a Sketch with Shapes that don't fit together", () => {
  test.each<[string, string, (shape: ShapeJson) => unknown, string]>([
    [
      "a Shape listed under an ID other than its own",
      "shape-2",
      (shape) => ({ ...shape, id: "shape-9" }),
      'id "shape-9" should be "shape-2", the ID it is listed under',
    ],
    [
      "a Shape inside a Shape that isn't there",
      "shape-2",
      (shape) => ({ ...shape, parent: "shape-9" }),
      'parent "shape-9" isn\'t a Shape in the file',
    ],
    [
      "a Shape inside a Shape that isn't a Container",
      "shape-2",
      (shape) => ({ ...shape, parent: "shape-4" }),
      'parent "shape-4" isn\'t a Container',
    ],
    [
      "a Shape inside a Shape that is inside it",
      "shape-1",
      (shape) => ({ ...shape, parent: "shape-2" }),
      'parent "shape-2" is inside it',
    ],
    [
      "an Arrow bound to a Shape that isn't there",
      "shape-4",
      (shape) => ({ ...shape, end: { kind: "outline", shape: "shape-9", at: { x: 0, y: 0.5 } } }),
      'end.shape "shape-9" isn\'t a Shape in the file',
    ],
    [
      "an Arrow bound to an Arrow",
      "shape-4",
      (shape) => ({ ...shape, end: { kind: "outline", shape: "shape-4", at: { x: 0, y: 0.5 } } }),
      'end.shape "shape-4" is an Arrow, and Arrows can\'t be bound to',
    ],
    [
      "an Arrow bound to a Port its Shape doesn't have",
      "shape-4",
      (shape) => ({ ...shape, start: { kind: "port", shape: "shape-2", port: 4 } }),
      'start.port 4 should be the number of one of the Ports of "shape-2", from 0 to 3',
    ],
  ])("%s is rejected", (_, id, change, problem) => {
    expect(importJson(changedShape(id, change))).toEqual({
      error: `Shape "${id}" in the file is invalid: ${problem}.`,
    });
  });
});
