import { describe, expect, test } from "vitest";
import {
  apply,
  boundsById,
  click,
  drag,
  drawRectangle,
  keyDown,
  keyUp,
  newEditor,
  pinch,
  pointerDown,
  pointerMove,
  pointerUp,
  press,
  redoInput,
  resetZoom,
  selectTool,
  twoRectangles,
  undoInput,
  wheel,
  zoomToFit,
} from "./test-helpers";
import type { EditorState } from "./editor";
import { canRedo, canUndo, selection, viewport } from "./queries";

function undo(state: EditorState) {
  return press(state, "z", { meta: true });
}
function redo(state: EditorState) {
  return press(state, "z", { meta: true, shift: true });
}

function oneRectangle() {
  return drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 });
}

describe("undo and redo", () => {
  test("undoing a create removes the Shape", () => {
    expect(boundsById(undo(oneRectangle()))).toEqual({});
  });

  test("redoing a create puts the Shape back", () => {
    expect(boundsById(redo(undo(oneRectangle())))).toEqual({
      "shape-1": { x: 100, y: 100, width: 100, height: 80 },
    });
  });

  test("the undo and redo inputs work like the shortcuts", () => {
    const undone = apply(oneRectangle(), undoInput);

    expect(boundsById(undone)).toEqual({});
    expect(boundsById(apply(undone, redoInput))).toEqual(boundsById(oneRectangle()));
  });

  test("a new editor has nothing to undo or redo", () => {
    expect(canUndo(newEditor())).toBe(false);
    expect(canRedo(newEditor())).toBe(false);
  });

  test("after a change there is something to undo but nothing to redo", () => {
    expect(canUndo(oneRectangle())).toBe(true);
    expect(canRedo(oneRectangle())).toBe(false);
  });

  test("after undoing the only change there is something to redo but nothing to undo", () => {
    expect(canUndo(undo(oneRectangle()))).toBe(false);
    expect(canRedo(undo(oneRectangle()))).toBe(true);
  });

  test("a drag made of many pointer moves undoes as one step, and redoes", () => {
    const dragged = apply(
      twoRectangles(),
      selectTool("select"),
      pointerDown({ x: 150, y: 140 }),
      pointerMove({ x: 160, y: 150 }),
      pointerMove({ x: 180, y: 160 }),
      pointerMove({ x: 200, y: 170 }),
      pointerUp({ x: 200, y: 170 }),
    );

    expect(boundsById(undo(dragged))).toEqual(boundsById(twoRectangles()));
    expect(boundsById(undo(undo(dragged)))).toEqual({ "shape-1": { x: 100, y: 100, width: 100, height: 80 } });
    expect(boundsById(redo(undo(dragged)))["shape-1"]).toEqual({ x: 150, y: 130, width: 100, height: 80 });
  });

  test("a resize undoes as one step, and redoes", () => {
    const resized = drag(click(twoRectangles(), { x: 150, y: 140 }), { x: 200, y: 180 }, { x: 250, y: 220 });

    expect(boundsById(undo(resized))).toEqual(boundsById(twoRectangles()));
    expect(boundsById(redo(undo(resized)))["shape-1"]).toEqual({ x: 100, y: 100, width: 150, height: 120 });
  });

  test("a delete undoes as one step, and redoes", () => {
    const bothSelected = click(click(twoRectangles(), { x: 150, y: 140 }), { x: 350, y: 140 }, { shift: true });
    const deleted = press(bothSelected, "Delete");

    expect(boundsById(undo(deleted))).toEqual(boundsById(twoRectangles()));
    expect(boundsById(redo(undo(deleted)))).toEqual({});
  });

  test("an arrow-key nudge undoes as one step", () => {
    const nudged = press(click(twoRectangles(), { x: 150, y: 140 }), "ArrowRight");

    expect(boundsById(undo(nudged))).toEqual(boundsById(twoRectangles()));
  });

  test("selection and tool changes add no step", () => {
    const selecting = apply(
      click(click(twoRectangles(), { x: 150, y: 140 }), { x: 350, y: 140 }, { shift: true }),
      keyDown("Escape"),
      keyDown("a", { meta: true }),
      selectTool("rectangle"),
      selectTool("select"),
    );
    const marqueed = drag(selecting, { x: 50, y: 50 }, { x: 250, y: 250 });

    expect(boundsById(undo(marqueed))).toEqual({ "shape-1": { x: 100, y: 100, width: 100, height: 80 } });
  });

  test("pressing a Shape without dragging it adds no step", () => {
    expect(canUndo(undo(click(oneRectangle(), { x: 150, y: 140 })))).toBe(false);
  });

  test("deleting with nothing selected adds no step", () => {
    expect(canUndo(undo(press(press(oneRectangle(), "Escape"), "Delete")))).toBe(false);
  });

  test.each([
    ["draw", selectTool("rectangle"), { x: 500, y: 300 }],
    ["drag", selectTool("select"), { x: 150, y: 140 }],
    ["resize", selectTool("select"), { x: 200, y: 180 }],
  ])("a %s cancelled with Escape adds no step", (_, tool, from) => {
    const cancelled = apply(
      click(oneRectangle(), { x: 150, y: 140 }),
      tool,
      pointerDown(from),
      pointerMove({ x: from.x + 50, y: from.y + 40 }),
      keyDown("Escape"),
      pointerUp({ x: from.x + 50, y: from.y + 40 }),
    );

    expect(canUndo(undo(cancelled))).toBe(false);
  });

  test("a new change after an undo clears the redo history", () => {
    const changed = drawRectangle(undo(twoRectangles()), { x: 500, y: 100 }, { x: 600, y: 180 });

    expect(canRedo(changed)).toBe(false);
    expect(Object.keys(boundsById(redo(changed)))).toEqual(["shape-1", "shape-3"]);
  });

  test("undoing more often than there are changes does nothing", () => {
    expect(boundsById(undo(undo(undo(oneRectangle()))))).toEqual({});
  });

  test("undoing a create drops the Shape from the selection", () => {
    expect(selection(undo(oneRectangle()))).toEqual([]);
  });

  test("undo waits until the current gesture is finished", () => {
    const midDrag = apply(
      oneRectangle(),
      selectTool("select"),
      pointerDown({ x: 150, y: 140 }),
      pointerMove({ x: 200, y: 170 }),
    );

    const state = apply(midDrag, keyDown("z", { meta: true }), undoInput, pointerUp({ x: 200, y: 170 }));

    expect(boundsById(state)).toEqual({ "shape-1": { x: 150, y: 130, width: 100, height: 80 } });
  });
});

describe("viewport changes and undo", () => {
  const changeViewport = (state: EditorState): EditorState =>
    apply(
      state,
      pinch({ x: 300, y: 200 }, 2),
      wheel({ x: 300, y: 200 }, { x: 0, y: -10 }, { ctrl: true }),
      wheel({ x: 300, y: 200 }, { x: 40, y: 20 }),
      keyDown(" "),
      pointerDown({ x: 100, y: 100 }),
      pointerMove({ x: 150, y: 100 }),
      pointerUp({ x: 150, y: 100 }),
      keyUp(" "),
      selectTool("pan"),
      pointerDown({ x: 100, y: 100 }),
      pointerMove({ x: 150, y: 100 }),
      pointerUp({ x: 150, y: 100 }),
      zoomToFit({ width: 800, height: 600 }),
      resetZoom({ width: 800, height: 600 }),
    );

  test("zooming and panning add no undo step", () => {
    expect(canUndo(changeViewport(newEditor()))).toBe(false);
  });

  test("undo after zooming and panning undoes the last change to the Sketch and leaves the viewport", () => {
    const changed = changeViewport(twoRectangles());

    const undone = apply(changed, undoInput);

    expect(Object.keys(boundsById(undone))).toEqual(["shape-1"]);
    expect(viewport(undone)).toEqual(viewport(changed));
  });
});
