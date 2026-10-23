import { describe, expect, test } from "vitest";
import { currentInteraction, pansOnPress, selection, viewport } from "./queries";
import {
  apply,
  boundsById,
  click,
  keyDown,
  keyUp,
  newEditor,
  pinch,
  pointerDown,
  pointerMove,
  pointerUp,
  press,
  selectTool,
  twoRectangles,
  wheel,
} from "./test-helpers";

const dragBy = (from: { x: number; y: number }, to: { x: number; y: number }) => [
  pointerDown(from),
  pointerMove(to),
  pointerUp(to),
];

describe("panning", () => {
  test("scrolling pans the viewport by the scrolled distance", () => {
    expect(viewport(apply(newEditor(), wheel({ x: 300, y: 200 }, { x: 30, y: -20 })))).toEqual({
      x: 30,
      y: -20,
      zoom: 1,
    });
  });

  test("scrolling pans by screen pixels, so it covers less of the Sketch when zoomed in", () => {
    const zoomedIn = apply(newEditor(), pinch({ x: 0, y: 0 }, 2));

    expect(viewport(apply(zoomedIn, wheel({ x: 300, y: 200 }, { x: 30, y: -20 })))).toEqual({
      x: 15,
      y: -10,
      zoom: 2,
    });
  });

  test("dragging with space held pans the viewport along with the pointer", () => {
    const state = apply(newEditor(), keyDown(" "), ...dragBy({ x: 100, y: 100 }, { x: 150, y: 130 }));

    expect(viewport(state)).toEqual({ x: -50, y: -30, zoom: 1 });
  });

  test("dragging with space held pans by screen pixels, so it covers less of the Sketch when zoomed in", () => {
    const zoomedIn = apply(newEditor(), pinch({ x: 0, y: 0 }, 2));

    const state = apply(zoomedIn, keyDown(" "), ...dragBy({ x: 100, y: 100 }, { x: 150, y: 130 }));

    expect(viewport(state)).toEqual({ x: -25, y: -15, zoom: 2 });
  });

  test("dragging with space held on a Shape pans instead of moving or selecting it", () => {
    const before = press(twoRectangles(), "Escape");

    const state = apply(before, keyDown(" "), ...dragBy({ x: 150, y: 140 }, { x: 200, y: 140 }));

    expect(boundsById(state)).toEqual(boundsById(before));
    expect(selection(state)).toEqual([]);
    expect(viewport(state)).toEqual({ x: -50, y: 0, zoom: 1 });
  });

  test("the editor is panning while space is held and the pointer is down", () => {
    const state = apply(newEditor(), keyDown(" "), pointerDown({ x: 100, y: 100 }), pointerMove({ x: 120, y: 100 }));

    expect(currentInteraction(state)).toEqual({ kind: "panning" });
  });

  test("once space is released, dragging no longer pans", () => {
    const state = apply(newEditor(), keyDown(" "), keyUp(" "), ...dragBy({ x: 100, y: 100 }, { x: 150, y: 130 }));

    expect(viewport(state)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  test("releasing space mid-drag keeps panning until the pointer is released", () => {
    const state = apply(
      newEditor(),
      keyDown(" "),
      pointerDown({ x: 100, y: 100 }),
      keyUp(" "),
      pointerMove({ x: 150, y: 100 }),
      pointerUp({ x: 150, y: 100 }),
    );

    expect(viewport(state)).toEqual({ x: -50, y: 0, zoom: 1 });
    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });

  test("dragging with the pan tool pans the viewport", () => {
    const state = apply(newEditor(), selectTool("pan"), ...dragBy({ x: 100, y: 100 }, { x: 150, y: 130 }));

    expect(viewport(state)).toEqual({ x: -50, y: -30, zoom: 1 });
  });

  test("the pan tool stays active after a drag", () => {
    const state = apply(newEditor(), selectTool("pan"), ...dragBy({ x: 100, y: 100 }, { x: 150, y: 130 }));

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
    expect(viewport(apply(state, ...dragBy({ x: 150, y: 130 }, { x: 100, y: 100 })))).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  test("Escape stops panning where the viewport is", () => {
    const state = apply(
      newEditor(),
      selectTool("pan"),
      pointerDown({ x: 100, y: 100 }),
      pointerMove({ x: 150, y: 100 }),
      keyDown("Escape"),
      pointerMove({ x: 200, y: 100 }),
    );

    expect(viewport(state)).toEqual({ x: -50, y: 0, zoom: 1 });
    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });

  test("pressing with space held after clicking a Shape keeps it selected", () => {
    const selected = click(press(twoRectangles(), "Escape"), { x: 150, y: 140 });

    const state = apply(selected, keyDown(" "), ...dragBy({ x: 350, y: 140 }, { x: 300, y: 140 }));

    expect(selection(state)).toEqual(["shape-1"]);
  });

  test("a press pans with the pan tool or while space is held, and otherwise uses the active tool", () => {
    expect(pansOnPress(newEditor())).toBe(false);
    expect(pansOnPress(apply(newEditor(), selectTool("pan")))).toBe(true);
    expect(pansOnPress(apply(newEditor(), keyDown(" ")))).toBe(true);
    expect(pansOnPress(apply(newEditor(), keyDown(" "), keyUp(" ")))).toBe(false);
  });
});
