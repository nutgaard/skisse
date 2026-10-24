import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import type { Bounds, Point } from "./geometry";
import { activeTool, selection, shapes } from "./queries";
import { shapeGeometry } from "./shape-geometry";
import { symbolDefinition, type SymbolId } from "./symbols";
import {
  apply,
  click,
  newEditor,
  pointerDown,
  pointerMove,
  pointerUp,
  press,
  selectTool,
  drawWithLabelOpen,
  typeLabel,
} from "./test-helpers";

type BuiltInSymbol = {
  readonly symbol: SymbolId;
  readonly shortcut: string;
  readonly defaultSize: { readonly width: number; readonly height: number };
};

const builtInSymbols: readonly BuiltInSymbol[] = [
  { symbol: "rectangle", shortcut: "r", defaultSize: { width: 160, height: 80 } },
  { symbol: "roundedRectangle", shortcut: "u", defaultSize: { width: 160, height: 80 } },
  { symbol: "ellipse", shortcut: "o", defaultSize: { width: 120, height: 80 } },
  { symbol: "diamond", shortcut: "d", defaultSize: { width: 140, height: 100 } },
  { symbol: "cylinder", shortcut: "c", defaultSize: { width: 100, height: 120 } },
  { symbol: "horizontalCylinder", shortcut: "q", defaultSize: { width: 160, height: 80 } },
  { symbol: "document", shortcut: "f", defaultSize: { width: 120, height: 80 } },
  { symbol: "cloud", shortcut: "k", defaultSize: { width: 160, height: 100 } },
  { symbol: "person", shortcut: "p", defaultSize: { width: 80, height: 120 } },
  { symbol: "text", shortcut: "t", defaultSize: { width: 120, height: 40 } },
];

const defaultBox: Bounds = { x: 100, y: 50, width: 160, height: 80 };

// A Shape of the Symbol filling `box`, by default (100,50)–(260,130), with a Label so that a text Shape stays, and
// nothing selected.
function unselectedShape(symbol: SymbolId, box: Bounds = defaultBox): EditorState {
  const corner = { x: box.x + box.width, y: box.y + box.height };
  const created = drawWithLabelOpen(newEditor(), symbol, { x: box.x, y: box.y }, corner);
  return press(press(typeLabel(created, "A"), "Escape"), "Escape");
}

// A point `distance` from `point` towards the middle of `box`, along one axis.
function towardsMiddle(point: Point, box: Bounds, distance: number): Point {
  const middle = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return point.x === middle.x
    ? { x: point.x, y: point.y + Math.sign(middle.y - point.y) * distance }
    : { x: point.x + Math.sign(middle.x - point.x) * distance, y: point.y };
}

function createByClicking(symbol: SymbolId, at: Point): EditorState {
  return apply(newEditor(), selectTool(symbol), pointerDown(at), pointerUp(at));
}

describe.each(builtInSymbols)("the $symbol tool", ({ symbol, shortcut, defaultSize }) => {
  test("dragging creates a Shape of the Symbol matching the drag", () => {
    const state = apply(
      newEditor(),
      selectTool(symbol),
      pointerDown({ x: 100, y: 50 }),
      pointerMove({ x: 260, y: 130 }),
      pointerUp({ x: 260, y: 130 }),
    );

    expect(shapes(state)).toEqual([{ id: "shape-1", symbol, bounds: { x: 100, y: 50, width: 160, height: 80 } }]);
  });

  test("clicking creates a Shape of the Symbol's default size, centred on the click", () => {
    const state = createByClicking(symbol, { x: 300, y: 200 });

    expect(shapes(state)).toEqual([
      {
        id: "shape-1",
        symbol,
        bounds: { x: 300 - defaultSize.width / 2, y: 200 - defaultSize.height / 2, ...defaultSize },
      },
    ]);
  });

  test("after creating a Shape, the select tool is active again", () => {
    expect(activeTool(createByClicking(symbol, { x: 300, y: 200 }))).toBe("select");
  });

  test("clicking the middle of the Shape selects it, though it has no fill", () => {
    expect(selection(click(unselectedShape(symbol), { x: 180, y: 90 }))).toEqual(["shape-1"]);
  });

  test("its Ports are the midpoints of the box's top, right, bottom and left sides", () => {
    expect(shapeGeometry(symbol, { x: 100, y: 50, width: 160, height: 80 }).ports).toEqual([
      { x: 180, y: 50 },
      { x: 260, y: 90 },
      { x: 180, y: 130 },
      { x: 100, y: 90 },
    ]);
  });

  test.each([
    ["wide", defaultBox],
    ["tall", { x: 100, y: 50, width: 60, height: 200 }],
  ])("in a %s box, its Ports lie on its outline, so a click just inside a Port hits the Shape", (_, box) => {
    const state = unselectedShape(symbol, box);

    shapeGeometry(symbol, box).ports.forEach((port) => {
      expect(selection(click(state, towardsMiddle(port, box, 1))), `inside the Port at ${port.x},${port.y}`).toEqual([
        "shape-1",
      ]);
    });
  });

  test.each([
    ["wide", defaultBox],
    ["tall", { x: 100, y: 50, width: 60, height: 200 }],
  ])("in a %s box, its Label area lies inside its outline", (_, box) => {
    const state = unselectedShape(symbol, box);
    const { x, y, width, height } = shapeGeometry(symbol, box).labelArea;

    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
    [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ].forEach((corner) => {
      expect(selection(click(state, corner)), `the corner at ${corner.x},${corner.y}`).toEqual(["shape-1"]);
    });
  });

  test(`pressing ${shortcut} selects the tool`, () => {
    expect(activeTool(press(newEditor(), shortcut))).toBe(symbol);
  });
});

describe("clicking just outside an outline that doesn't fill its box", () => {
  test.each([
    ["roundedRectangle", { x: 102, y: 52 }],
    ["ellipse", { x: 102, y: 52 }],
    ["diamond", { x: 102, y: 52 }],
    ["cylinder", { x: 102, y: 52 }],
    ["horizontalCylinder", { x: 102, y: 52 }],
    ["document", { x: 102, y: 128 }],
    ["cloud", { x: 102, y: 52 }],
    ["person", { x: 102, y: 52 }],
  ] as const)("does not select a %s", (symbol, at) => {
    expect(selection(click(unselectedShape(symbol), at))).toEqual([]);
  });

  test.each(["rectangle", "text"] as const)("a %s fills its box, so a click near its corner selects it", (symbol) => {
    expect(selection(click(unselectedShape(symbol), { x: 102, y: 52 }))).toEqual(["shape-1"]);
  });
});

describe("Containers", () => {
  test.each(["rectangle", "roundedRectangle", "cloud"] as const)(
    "a %s can be a Container, and its Label defaults to the top-left corner",
    (symbol) => {
      expect(symbolDefinition(symbol)).toMatchObject({ canBeContainer: true, defaultLabelAlignment: "topLeft" });
    },
  );

  test.each(["ellipse", "diamond", "cylinder", "horizontalCylinder", "document", "person", "text"] as const)(
    "a %s can't be a Container, and its Label defaults to the middle",
    (symbol) => {
      expect(symbolDefinition(symbol)).toMatchObject({ canBeContainer: false, defaultLabelAlignment: "center" });
    },
  );
});
