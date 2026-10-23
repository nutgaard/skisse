import { describe, expect, test } from "vitest";
import type { Point } from "./geometry";
import { shapes, viewport } from "./queries";
import {
  apply,
  boundsById,
  drag,
  drawRectangle,
  newEditor,
  pinch,
  pointerDown,
  pointerUp,
  resetZoom,
  selectTool,
  sketchPointUnder,
  twoRectangles,
  wheel,
  zoomToFit,
} from "./test-helpers";

const pointer = { x: 300, y: 200 };

function expectSamePoint(actual: Point, expected: Point) {
  expect(actual.x).toBeCloseTo(expected.x);
  expect(actual.y).toBeCloseTo(expected.y);
}

describe("zooming", () => {
  test("a new editor shows the Sketch from its origin at 100%", () => {
    expect(viewport(newEditor())).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  test("pinching zooms around the pointer", () => {
    expect(viewport(apply(newEditor(), pinch({ x: 200, y: 100 }, 2)))).toEqual({ x: 100, y: 50, zoom: 2 });
  });

  test("drawing a rectangle while zoomed in creates it at the Sketch point under the pointer", () => {
    const zoomedIn = apply(newEditor(), pinch({ x: 0, y: 0 }, 2));

    const [rectangle] = shapes(drawRectangle(zoomedIn, { x: 100, y: 100 }, { x: 300, y: 200 }));

    expect(rectangle?.bounds).toEqual({ x: 50, y: 50, width: 100, height: 50 });
  });

  test.each([["ctrl", { ctrl: true }], ["cmd", { meta: true }]])(
    "%s + scrolling up zooms in, keeping the Sketch point under the pointer under it",
    (_, modifiers) => {
      const before = apply(newEditor(), pinch({ x: 0, y: 0 }, 1.5));

      const after = apply(before, wheel(pointer, { x: 0, y: -10 }, modifiers));

      expect(viewport(after).zoom).toBeGreaterThan(1.5);
      expectSamePoint(sketchPointUnder(after, pointer), sketchPointUnder(before, pointer));
    },
  );

  test("ctrl + scrolling down zooms out, keeping the Sketch point under the pointer under it", () => {
    const before = newEditor();

    const after = apply(before, wheel(pointer, { x: 0, y: 10 }, { ctrl: true }));

    expect(viewport(after).zoom).toBeLessThan(1);
    expectSamePoint(sketchPointUnder(after, pointer), sketchPointUnder(before, pointer));
  });

  test("scrolling further zooms further", () => {
    const zoomOf = (deltaY: number) =>
      viewport(apply(newEditor(), wheel(pointer, { x: 0, y: deltaY }, { ctrl: true }))).zoom;

    expect(zoomOf(-20)).toBeGreaterThan(zoomOf(-10));
  });

  test("zooming in stops at 800%, still keeping the Sketch point under the pointer under it", () => {
    const before = newEditor();

    const after = apply(
      before,
      pinch(pointer, 5),
      pinch(pointer, 5),
      wheel(pointer, { x: 0, y: -50 }, { ctrl: true }),
    );

    expect(viewport(after).zoom).toBe(8);
    expectSamePoint(sketchPointUnder(after, pointer), sketchPointUnder(before, pointer));
  });

  test("zooming out stops at 10%, still keeping the Sketch point under the pointer under it", () => {
    const before = newEditor();

    const after = apply(
      before,
      pinch(pointer, 0.2),
      pinch(pointer, 0.2),
      wheel(pointer, { x: 0, y: 50 }, { ctrl: true }),
    );

    expect(viewport(after).zoom).toBe(0.1);
    expectSamePoint(sketchPointUnder(after, pointer), sketchPointUnder(before, pointer));
  });
});

describe("editing while zoomed and panned", () => {
  test("drawing a rectangle after zooming and panning creates it at the Sketch point under the pointer", () => {
    const moved = apply(newEditor(), pinch({ x: 0, y: 0 }, 2), wheel(pointer, { x: 100, y: 50 }));

    const [rectangle] = shapes(drawRectangle(moved, { x: 100, y: 100 }, { x: 300, y: 200 }));

    expect(rectangle?.bounds).toEqual({ x: 100, y: 75, width: 100, height: 50 });
  });

  test("dragging a Shape while zoomed in moves it by the Sketch distance the pointer covers", () => {
    const zoomedIn = apply(twoRectangles(), pinch({ x: 0, y: 0 }, 2));

    const state = drag(zoomedIn, { x: 300, y: 280 }, { x: 400, y: 280 });

    expect(boundsById(state)["shape-1"]).toEqual({ x: 150, y: 100, width: 100, height: 80 });
  });

  test("the drag threshold is in screen pixels, so a small drag zoomed out does not move a Shape", () => {
    const zoomedOut = apply(twoRectangles(), pinch({ x: 0, y: 0 }, 0.25));

    const state = drag(zoomedOut, { x: 37.5, y: 35 }, { x: 39.5, y: 35 });

    expect(boundsById(state)["shape-1"]).toEqual({ x: 100, y: 100, width: 100, height: 80 });
  });

  test("the drag threshold is in screen pixels, so a short drag zoomed in still moves a Shape", () => {
    const zoomedIn = apply(twoRectangles(), pinch({ x: 0, y: 0 }, 4));

    const state = drag(zoomedIn, { x: 600, y: 560 }, { x: 604, y: 560 });

    expect(boundsById(state)["shape-1"]).toEqual({ x: 101, y: 100, width: 100, height: 80 });
  });

  test("a resize handle is grabbed within the same screen distance at any zoom", () => {
    // shape-2 is selected. Zoomed out to 50%, its south-east handle at (400,180) is on screen at (200,90).
    const zoomedOut = apply(twoRectangles(), pinch({ x: 0, y: 0 }, 0.5));

    const state = drag(zoomedOut, { x: 205, y: 95 }, { x: 225, y: 105 });

    expect(boundsById(state)["shape-2"]).toEqual({ x: 300, y: 100, width: 140, height: 100 });
  });
});

describe("zoom to fit and reset zoom", () => {
  test("zoom to fit frames all Shapes with a margin, centred on the screen", () => {
    // The Shapes span (100,100)–(400,180). At 200% they fill the screen's width, less 50 pixels on each side.
    const state = apply(twoRectangles(), pinch(pointer, 0.5), zoomToFit({ width: 700, height: 600 }));

    expect(viewport(state)).toEqual({ x: 75, y: -10, zoom: 2 });
  });

  test("zoom to fit zooms no further in than 800%", () => {
    const oneSmallShape = apply(
      newEditor(),
      selectTool("rectangle"),
      pointerDown({ x: 500, y: 500 }),
      pointerUp({ x: 504, y: 504 }),
    );

    const state = apply(oneSmallShape, zoomToFit({ width: 700, height: 600 }));

    expect(viewport(state)).toEqual({ x: 461.25, y: 467.5, zoom: 8 });
  });

  test("zoom to fit on an empty Sketch returns to 100%, keeping the Sketch point at the screen's centre", () => {
    const state = apply(newEditor(), pinch({ x: 0, y: 0 }, 2), zoomToFit({ width: 800, height: 600 }));

    expect(viewport(state)).toEqual({ x: -200, y: -150, zoom: 1 });
  });

  test("reset zoom returns to 100%, keeping the Sketch point at the screen's centre", () => {
    const state = apply(twoRectangles(), pinch({ x: 0, y: 0 }, 2), resetZoom({ width: 800, height: 600 }));

    expect(viewport(state)).toEqual({ x: -200, y: -150, zoom: 1 });
  });
});
