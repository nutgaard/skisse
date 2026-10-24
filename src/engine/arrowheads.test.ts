import { describe, expect, test } from "vitest";
import { arrowheads, type Arrowhead } from "./arrow";
import type { EditorState } from "./editor";
import { exportSvg } from "./export";
import { fixedWidthTextMeasurer } from "./fakes";
import type { Point } from "./geometry";
import { arrows, rendering, selectionArrowheads, sketch } from "./queries";
import { svgText, type SvgElement } from "./svg";
import {
  apply,
  click,
  drawArrow,
  drawRectangle,
  newEditor,
  press,
  twoRectangles,
  undoInput,
} from "./test-helpers";

// An Arrow, shape-3, from the right side of shape-1 at (200,130) to the left Port of shape-2 at (300,140). It is
// selected.
function boundArrow(): EditorState {
  return drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 305, y: 140 });
}

function headsOf(state: EditorState) {
  return arrows(state).map(({ heads }) => heads);
}

function chooseHead(state: EditorState, end: "start" | "end", arrowhead: Arrowhead): EditorState {
  return apply(state, { type: "changeArrowhead", end, arrowhead });
}

describe("arrowheads", () => {
  test("a new Arrow has no head at its start and an arrow at its end", () => {
    expect(headsOf(boundArrow())).toEqual([{ start: "none", end: "arrow" }]);
  });

  test.each(arrowheads.flatMap((arrowhead) => [["start", arrowhead] as const, ["end", arrowhead] as const]))(
    "the %s can have a head of %s, leaving the other end as it was",
    (end, arrowhead) => {
      const state = chooseHead(boundArrow(), end, arrowhead);

      expect(headsOf(state)).toEqual([{ start: "none", end: "arrow", [end]: arrowhead }]);
    },
  );

  test("one change is one undo step", () => {
    const changed = chooseHead(chooseHead(boundArrow(), "start", "diamond"), "end", "circle");

    expect(headsOf(apply(changed, undoInput))).toEqual([{ start: "diamond", end: "arrow" }]);
    expect(headsOf(apply(changed, undoInput, undoInput))).toEqual([{ start: "none", end: "arrow" }]);
  });

  test("takes only the arrowheads there are", () => {
    const state = chooseHead(boundArrow(), "end", "star" as Arrowhead);

    expect(headsOf(state)).toEqual([{ start: "none", end: "arrow" }]);
  });

  test("leaves the Shapes made from a Symbol among the selection as they are", () => {
    const both = click(boundArrow(), { x: 150, y: 140 }, { shift: true });

    const state = chooseHead(both, "start", "circle");

    expect(headsOf(state)).toEqual([{ start: "circle", end: "arrow" }]);
  });

  test("chosen with nothing selected are the heads of the next Arrows", () => {
    const chosen = chooseHead(press(twoRectangles(), "Escape"), "start", "openArrow");

    const state = drawArrow(chosen, { x: 195, y: 130 }, { x: 305, y: 140 });

    expect(headsOf(state)).toEqual([{ start: "openArrow", end: "arrow" }]);
  });
});

describe("the arrowheads shown for the selection", () => {
  test("are the selected Arrow's", () => {
    expect(selectionArrowheads(chooseHead(boundArrow(), "start", "diamond"))).toEqual({
      start: "diamond",
      end: "arrow",
    });
  });

  test("are mixed at each end the selected Arrows differ at", () => {
    const another = chooseHead(drawArrow(boundArrow(), { x: 100, y: 400 }, { x: 300, y: 500 }), "end", "circle");

    const state = click(another, { x: 250, y: 135 }, { shift: true });

    expect(selectionArrowheads(state)).toEqual({ start: "none", end: "mixed" });
  });

  test("are none with only Shapes made from a Symbol selected", () => {
    expect(selectionArrowheads(click(boundArrow(), { x: 150, y: 140 }))).toBeUndefined();
  });

  test("with nothing selected, are the heads new Arrows get", () => {
    const chosen = chooseHead(press(twoRectangles(), "Escape"), "end", "diamond");

    expect(selectionArrowheads(chosen)).toEqual({ start: "none", end: "diamond" });
  });
});

// shape-1 at (100,100)–(200,180) and shape-2 at (300,200)–(400,280), with an elbow Arrow, shape-3, from shape-1's
// right Port at (200,140) right to (250,140), down to (250,240) and right to shape-2's left Port at (300,240). Its
// final segment at each end runs left to right.
function elbowCrossing(heads: { start: Arrowhead; end: Arrowhead }): EditorState {
  const shapes = drawRectangle(
    drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }),
    { x: 300, y: 200 },
    { x: 400, y: 280 },
  );
  const arrow = drawArrow(shapes, { x: 198, y: 140 }, { x: 302, y: 240 });
  return chooseHead(
    chooseHead(apply(arrow, { type: "changeRouting", routing: "elbow" }), "start", heads.start),
    "end",
    heads.end,
  );
}

function descendants(element: SvgElement): readonly SvgElement[] {
  return element.children.flatMap((child) => (typeof child === "string" ? [] : [child, ...descendants(child)]));
}

function headElement(state: EditorState, end: "start" | "end"): SvgElement | undefined {
  return descendants(rendering(state)).find(({ attributes }) => attributes["data-arrowhead"] === end);
}

// The points a head's path runs through, in order, rounded to hide floating-point noise.
function headPoints(state: EditorState, end: "start" | "end"): readonly Point[] {
  const numbers = String(headElement(state, end)?.attributes.d ?? "")
    .split(/[^-\d.]+/)
    .filter((text) => text !== "")
    .map((text) => Math.round(Number(text) * 1000) / 1000 + 0);
  return Array.from({ length: numbers.length / 2 }, (_, index) => ({
    x: numbers[index * 2] ?? NaN,
    y: numbers[index * 2 + 1] ?? NaN,
  }));
}

function byPosition(points: readonly Point[]): readonly Point[] {
  return points.toSorted((a, b) => a.x - b.x || a.y - b.y);
}

describe("drawing arrowheads", () => {
  test("an arrow is a filled triangle, its tip at the end and its back across the final segment", () => {
    const state = elbowCrossing({ start: "arrow", end: "arrow" });

    expect(byPosition(headPoints(state, "end"))).toEqual([
      { x: 288, y: 234 },
      { x: 288, y: 246 },
      { x: 300, y: 240 },
    ]);
    expect(byPosition(headPoints(state, "start"))).toEqual([
      { x: 200, y: 140 },
      { x: 212, y: 134 },
      { x: 212, y: 146 },
    ]);
    expect(headElement(state, "end")?.attributes.fill).toBe("#1e1e1e");
  });

  test("an open arrow is two lines meeting at the end, and not filled", () => {
    const state = elbowCrossing({ start: "openArrow", end: "openArrow" });

    expect(headPoints(state, "end")).toEqual([
      { x: 288, y: 234 },
      { x: 300, y: 240 },
      { x: 288, y: 246 },
    ]);
    expect(headPoints(state, "start")).toEqual([
      { x: 212, y: 146 },
      { x: 200, y: 140 },
      { x: 212, y: 134 },
    ]);
    expect(headElement(state, "end")?.attributes.fill).toBe("none");
  });

  test("a diamond has one corner at the end and the opposite corner back along the final segment", () => {
    const state = elbowCrossing({ start: "diamond", end: "diamond" });

    expect(byPosition(headPoints(state, "end"))).toEqual([
      { x: 276, y: 240 },
      { x: 288, y: 234 },
      { x: 288, y: 246 },
      { x: 300, y: 240 },
    ]);
    expect(byPosition(headPoints(state, "start"))).toEqual([
      { x: 200, y: 140 },
      { x: 212, y: 134 },
      { x: 212, y: 146 },
      { x: 224, y: 140 },
    ]);
  });

  test("a circle touches the end, its centre back along the final segment", () => {
    const state = elbowCrossing({ start: "circle", end: "circle" });

    expect(headElement(state, "end")?.attributes).toMatchObject({ cx: 294, cy: 240, r: 6 });
    expect(headElement(state, "start")?.attributes).toMatchObject({ cx: 206, cy: 140, r: 6 });
  });

  test("no head draws nothing at that end", () => {
    const state = elbowCrossing({ start: "none", end: "arrow" });

    expect(headElement(state, "start")).toBeUndefined();
    expect(headElement(state, "end")).toBeDefined();
  });

  test("a head follows a straight Arrow's slant", () => {
    // From (200,130) to (300,140), a slant of 1 in 10.
    const state = chooseHead(drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 305, y: 140 }), "end", "openArrow");
    const [back, tip] = headPoints(state, "end");
    if (!back || !tip) throw new Error("expected a head at the end");

    expect(tip).toEqual({ x: 300, y: 140 });
    // The middle of the head's back is on the line, 12 back from the tip.
    const [, , other] = headPoints(state, "end");
    const middle = { x: (back.x + (other?.x ?? NaN)) / 2, y: (back.y + (other?.y ?? NaN)) / 2 };
    expect(middle.x).toBeCloseTo(300 - 12 * (100 / Math.hypot(100, 10)));
    expect(middle.y).toBeCloseTo(140 - 12 * (10 / Math.hypot(100, 10)));
  });

  test("a thick Arrow has larger heads", () => {
    const state = apply(elbowCrossing({ start: "none", end: "arrow" }), {
      type: "changeStyle",
      style: { strokeWidth: "thick" },
    });

    expect(byPosition(headPoints(state, "end"))).toEqual([
      { x: 284, y: 232 },
      { x: 284, y: 248 },
      { x: 300, y: 240 },
    ]);
  });

  test("heads are drawn solid on a dashed Arrow", () => {
    const state = apply(elbowCrossing({ start: "none", end: "arrow" }), {
      type: "changeStyle",
      style: { strokePattern: "dashed" },
    });

    expect(headElement(state, "end")?.attributes["stroke-dasharray"]).toBeUndefined();
  });

  test("the export draws the heads as on screen", () => {
    const state = elbowCrossing({ start: "diamond", end: "arrow" });

    expect(exportSvg(sketch(state), fixedWidthTextMeasurer)).toContain(svgText(rendering(state)));
  });
});
