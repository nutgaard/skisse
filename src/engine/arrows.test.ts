import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { exportSvg } from "./export";
import { fixedWidthTextMeasurer } from "./fakes";
import type { Point } from "./geometry";
import {
  activeTool,
  arrowEndHandles,
  arrows,
  currentInteraction,
  rendering,
  selection,
  sketch,
  visiblePorts,
  type ArrowView,
} from "./queries";
import { svgText } from "./svg";
import {
  apply,
  boundsById,
  click,
  drag,
  drawArrow,
  drawRectangle,
  keyDown,
  newEditor,
  pinch,
  pointerDown,
  pointerMove,
  pointerUp,
  press,
  selectTool,
  twoRectangles,
} from "./test-helpers";

// In twoRectangles(), shape-1 at (100,100)–(200,180) has its Ports at (150,100), (200,140), (150,180) and (100,140),
// and shape-2 at (300,100)–(400,180) at (350,100), (400,140), (350,180) and (300,140). Ports are snapped to within 10
// screen pixels.

// An Arrow, shape-3, from the right side of shape-1 at (200,130) to the left Port of shape-2 at (300,140). It is
// selected.
function boundArrow(): EditorState {
  return drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 305, y: 140 });
}

function onlyArrow(state: EditorState): ArrowView {
  const [arrow, ...others] = arrows(state);
  if (!arrow || others.length > 0) throw new Error(`expected one Arrow, got ${arrows(state).length}`);
  return arrow;
}

function undo(state: EditorState): EditorState {
  return press(state, "z", { meta: true });
}

// An Arrow being drawn on twoRectangles(), pressed at `from` with the Arrow tool and dragged to `to`.
function drawingArrow(from: Point, to: Point): EditorState {
  return apply(twoRectangles(), selectTool("arrow"), pointerDown(from), pointerMove(to));
}

// The middle of boundArrow()'s Arrow, on its line.
const middleOfArrow = { x: 250, y: 135 };

describe("drawing an Arrow", () => {
  test("dragging from one Shape to another binds both ends", () => {
    expect(arrows(boundArrow())).toEqual([
      {
        id: "shape-3",
        routing: "straight",
        start: { point: { x: 200, y: 130 }, binding: { shape: "shape-1" } },
        end: { point: { x: 300, y: 140 }, binding: { shape: "shape-2", port: 3 } },
        path: [
          { x: 200, y: 130 },
          { x: 300, y: 140 },
        ],
      },
    ]);
  });

  test("letting go near a Port snaps the end to it", () => {
    const state = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 306, y: 146 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 300, y: 140 }, binding: { shape: "shape-2", port: 3 } });
  });

  test("letting go elsewhere over a Shape binds the end to the nearest point on its outline", () => {
    const state = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 310, y: 160 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 300, y: 160 }, binding: { shape: "shape-2" } });
  });

  test("letting go just outside a Shape, but near a Port, snaps to the Port", () => {
    const state = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 294, y: 140 });

    expect(onlyArrow(state).end.binding).toEqual({ shape: "shape-2", port: 3 });
  });

  test("letting go on a Shape's right edge, away from a Port, binds the end to the outline there", () => {
    const state = drawArrow(twoRectangles(), { x: 250, y: 300 }, { x: 400, y: 115 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 400, y: 115 }, binding: { shape: "shape-2" } });
  });

  test("letting go just outside a Shape, within 10 screen pixels of its outline, binds the end to the outline", () => {
    const state = drawArrow(twoRectangles(), { x: 250, y: 300 }, { x: 330, y: 188 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 330, y: 180 }, binding: { shape: "shape-2" } });
  });

  test("letting go further outside a Shape leaves the end floating", () => {
    const state = drawArrow(twoRectangles(), { x: 250, y: 300 }, { x: 330, y: 192 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 330, y: 192 } });
  });

  test("letting go over empty space leaves the end floating there", () => {
    const state = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 250, y: 300 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 250, y: 300 } });
  });

  test("starting over empty space leaves the start floating there", () => {
    const state = drawArrow(twoRectangles(), { x: 250, y: 300 }, { x: 305, y: 140 });

    expect(onlyArrow(state).start).toEqual({ point: { x: 250, y: 300 } });
    expect(onlyArrow(state).end.binding).toEqual({ shape: "shape-2", port: 3 });
  });

  test("an Arrow whose ends would land on the same point is not drawn", () => {
    const state = drawArrow(twoRectangles(), { x: 195, y: 140 }, { x: 198, y: 148 });

    expect(arrows(state)).toEqual([]);
    expect(activeTool(state)).toBe("arrow");
  });

  test("a click with the Arrow tool draws nothing", () => {
    const at = { x: 250, y: 300 };
    const state = apply(twoRectangles(), selectTool("arrow"), pointerDown(at), pointerUp(at));

    expect(arrows(state)).toEqual([]);
    expect(activeTool(state)).toBe("arrow");
  });

  test("the new Arrow is selected and the tool goes back to select", () => {
    expect(selection(boundArrow())).toEqual(["shape-3"]);
    expect(activeTool(boundArrow())).toBe("select");
  });

  test("A selects the Arrow tool", () => {
    expect(activeTool(press(newEditor(), "a"))).toBe("arrow");
  });

  test("Escape while drawing cancels the Arrow", () => {
    const state = apply(
      twoRectangles(),
      selectTool("arrow"),
      pointerDown({ x: 195, y: 130 }),
      pointerMove({ x: 305, y: 140 }),
      keyDown("Escape"),
      pointerUp({ x: 305, y: 140 }),
    );

    expect(arrows(state)).toEqual([]);
  });

  test("an Arrow can't bind to another Arrow", () => {
    const floating = drawArrow(newEditor(), { x: 100, y: 300 }, { x: 400, y: 300 });

    const state = drawArrow(floating, { x: 250, y: 100 }, { x: 250, y: 300 });

    expect(arrows(state)[1]?.end).toEqual({ point: { x: 250, y: 300 } });
  });
});

describe("snapping to Ports at any zoom", () => {
  // At 2×, a screen point is twice the Sketch point.
  function zoomedIn(): EditorState {
    return apply(twoRectangles(), pinch({ x: 0, y: 0 }, 2));
  }

  test("zoomed in, an end 8.5 Sketch units from a Port, 17 screen pixels, doesn't snap to it", () => {
    const state = drawArrow(zoomedIn(), { x: 390, y: 260 }, { x: 612, y: 292 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 300, y: 146 }, binding: { shape: "shape-2" } });
  });

  test("zoomed out, an end 16 Sketch units from a Port, 8 screen pixels, snaps to it", () => {
    const zoomedOut = apply(twoRectangles(), pinch({ x: 0, y: 0 }, 0.5));

    const state = drawArrow(zoomedOut, { x: 97.5, y: 65 }, { x: 158, y: 70 });

    expect(onlyArrow(state).end.binding).toEqual({ shape: "shape-2", port: 3 });
  });

  test("at 100%, the same end 16 Sketch units from the Port doesn't snap to it", () => {
    const state = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 316, y: 140 });

    expect(onlyArrow(state).end.binding).toEqual({ shape: "shape-2" });
  });
});

describe("bound ends follow their Shapes", () => {
  test("moving a Shape moves the end bound to its Port", () => {
    const state = drag(boundArrow(), { x: 350, y: 140 }, { x: 350, y: 240 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 130 },
      { x: 300, y: 240 },
    ]);
  });

  test("moving a Shape moves the end bound to its outline", () => {
    const state = drag(boundArrow(), { x: 150, y: 140 }, { x: 50, y: 140 });

    expect(onlyArrow(state).start.point).toEqual({ x: 100, y: 130 });
  });

  test("an end bound to the outline keeps its place along it when the Shape is resized", () => {
    // The end is at (300,160), three quarters of the way down shape-2's left side.
    const outlineBound = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 310, y: 160 });
    const shape2Selected = click(outlineBound, { x: 350, y: 140 });

    // Drags the bottom handle down, making shape-2 160 high.
    const state = drag(shape2Selected, { x: 350, y: 180 }, { x: 350, y: 260 });

    expect(onlyArrow(state).end.point).toEqual({ x: 300, y: 220 });
  });

  test("an end bound to a Port stays at it when the Shape is resized", () => {
    const shape2Selected = click(boundArrow(), { x: 350, y: 140 });

    const state = drag(shape2Selected, { x: 350, y: 180 }, { x: 350, y: 260 });

    expect(onlyArrow(state).end.point).toEqual({ x: 300, y: 180 });
  });

  test("an Arrow being drawn is not moved by the Shapes it will bind to", () => {
    expect(sketch(apply(twoRectangles(), selectTool("arrow"), pointerDown({ x: 195, y: 130 })))).toEqual(
      sketch(twoRectangles()),
    );
  });
});

describe("changing an Arrow's ends", () => {
  // boundArrow() and a rectangle, shape-4, at (300,300)–(400,380), with the Arrow selected.
  function withThirdRectangle(): EditorState {
    return click(drawRectangle(boundArrow(), { x: 300, y: 300 }, { x: 400, y: 380 }), middleOfArrow);
  }

  test("a selected Arrow has a handle on each end", () => {
    expect(arrowEndHandles(boundArrow())).toEqual([
      { end: "start", position: { x: 200, y: 130 } },
      { end: "end", position: { x: 300, y: 140 } },
    ]);
  });

  test("an Arrow selected with other Shapes has no handles on its ends", () => {
    expect(arrowEndHandles(click(boundArrow(), { x: 150, y: 140 }, { shift: true }))).toEqual([]);
  });

  test("dragging an end onto another Shape rebinds it", () => {
    const state = drag(withThirdRectangle(), { x: 300, y: 140 }, { x: 345, y: 305 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 350, y: 300 }, binding: { shape: "shape-4", port: 0 } });
    expect(onlyArrow(state).start.binding).toEqual({ shape: "shape-1" });
  });

  test("dragging the start onto another Shape rebinds it", () => {
    const state = drag(withThirdRectangle(), { x: 200, y: 130 }, { x: 310, y: 360 });

    expect(onlyArrow(state).start).toEqual({ point: { x: 300, y: 360 }, binding: { shape: "shape-4" } });
  });

  test("dragging an end onto empty space unbinds it", () => {
    const state = drag(boundArrow(), { x: 300, y: 140 }, { x: 250, y: 300 });

    expect(onlyArrow(state).end).toEqual({ point: { x: 250, y: 300 } });
  });

  test("dragging an end onto another Arrow leaves it floating", () => {
    const other = drawArrow(boundArrow(), { x: 100, y: 400 }, { x: 400, y: 400 });
    const firstSelected = click(other, middleOfArrow);

    const state = drag(firstSelected, { x: 300, y: 140 }, { x: 250, y: 400 });

    expect(arrows(state)[0]?.end).toEqual({ point: { x: 250, y: 400 } });
  });

  test("shows which end is being dragged", () => {
    const state = apply(boundArrow(), pointerDown({ x: 300, y: 140 }), pointerMove({ x: 250, y: 300 }));

    expect(currentInteraction(state)).toEqual({ kind: "draggingArrowEnd", arrowId: "shape-3", end: "end" });
  });

  test("Escape while dragging an end puts it back", () => {
    const dragging = apply(boundArrow(), pointerDown({ x: 300, y: 140 }), pointerMove({ x: 250, y: 300 }));

    const state = apply(dragging, keyDown("Escape"));

    expect(arrows(state)).toEqual(arrows(boundArrow()));
  });

  test("dragging an end is one undo step", () => {
    const state = undo(drag(boundArrow(), { x: 300, y: 140 }, { x: 250, y: 300 }));

    expect(arrows(state)).toEqual(arrows(boundArrow()));
  });
});

describe("deleting a bound Shape", () => {
  test("leaves the Arrow with that end floating where it was", () => {
    const state = press(click(boundArrow(), { x: 350, y: 140 }), "Delete");

    expect(onlyArrow(state)).toMatchObject({
      start: { point: { x: 200, y: 130 }, binding: { shape: "shape-1" } },
      end: { point: { x: 300, y: 140 } },
    });
    expect(onlyArrow(state).end.binding).toBeUndefined();
  });

  test("the floating end stays put when the other Shape moves", () => {
    const deleted = press(click(boundArrow(), { x: 350, y: 140 }), "Delete");

    const state = drag(deleted, { x: 150, y: 140 }, { x: 150, y: 240 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 230 },
      { x: 300, y: 140 },
    ]);
  });

  test("undoing the delete binds the end again", () => {
    const state = undo(press(click(boundArrow(), { x: 350, y: 140 }), "Delete"));

    expect(arrows(state)).toEqual(arrows(boundArrow()));
  });

  test("deleting a Container leaves the Arrows bound to its children floating", () => {
    const container = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 500, y: 300 });
    // shape-2 inside the Container at (100,100)–(200,180), shape-3 outside it at (600,100)–(700,180).
    const inside = drawRectangle(container, { x: 100, y: 100 }, { x: 200, y: 180 });
    const children = drawRectangle(inside, { x: 600, y: 100 }, { x: 700, y: 180 });
    const withArrow = drawArrow(children, { x: 204, y: 140 }, { x: 596, y: 140 });

    const state = press(click(withArrow, { x: 20, y: 280 }), "Delete");

    expect(onlyArrow(state)).toMatchObject({
      start: { point: { x: 200, y: 140 } },
      end: { point: { x: 600, y: 140 }, binding: { shape: "shape-3", port: 3 } },
    });
    expect(onlyArrow(state).start.binding).toBeUndefined();
  });
});

describe("an Arrow is a Shape", () => {
  // A floating Arrow, shape-1, from (100,100) to (200,100).
  function floating(): EditorState {
    return drawArrow(newEditor(), { x: 100, y: 100 }, { x: 200, y: 100 });
  }

  test("clicking its line selects it", () => {
    expect(selection(click(press(boundArrow(), "Escape"), middleOfArrow))).toEqual(["shape-3"]);
  });

  test("clicking near its line, within 6 screen pixels, selects it", () => {
    expect(selection(click(press(boundArrow(), "Escape"), { x: 250, y: 141 }))).toEqual(["shape-3"]);
  });

  test("clicking further from its line doesn't select it", () => {
    expect(selection(click(press(boundArrow(), "Escape"), { x: 250, y: 145 }))).toEqual([]);
  });

  test("a marquee around it selects it", () => {
    const state = drag(press(boundArrow(), "Escape"), { x: 50, y: 50 }, { x: 450, y: 250 });

    expect(selection(state)).toEqual(["shape-1", "shape-2", "shape-3"]);
  });

  test("dragging it moves it when both ends float", () => {
    const state = drag(floating(), { x: 150, y: 100 }, { x: 170, y: 150 });

    expect(onlyArrow(state).path).toEqual([
      { x: 120, y: 150 },
      { x: 220, y: 150 },
    ]);
  });

  test("dragging it doesn't move it when an end is bound", () => {
    const state = drag(boundArrow(), middleOfArrow, { x: 250, y: 300 });

    expect(arrows(state)).toEqual(arrows(boundArrow()));
  });

  test("the arrow keys nudge it when both ends float", () => {
    expect(onlyArrow(press(floating(), "ArrowDown")).path).toEqual([
      { x: 100, y: 101 },
      { x: 200, y: 101 },
    ]);
  });

  test("snapping a nudge of a bound Arrow leaves it where it is", () => {
    expect(arrows(press(boundArrow(), "ArrowRight", { alt: true }))).toEqual(arrows(boundArrow()));
  });

  test("moving it with a Shape it is bound to moves only the bound end, with the Shape", () => {
    const halfBound = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 250, y: 300 });
    const bothSelected = click(halfBound, { x: 150, y: 140 }, { shift: true });

    const state = drag(bothSelected, { x: 150, y: 140 }, { x: 150, y: 160 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 150 },
      { x: 250, y: 300 },
    ]);
  });

  test("a bound Arrow selected with a Shape doesn't count where the Shape snaps to when moved", () => {
    // An Arrow from (253,47), off the grid, to shape-2's left Port, selected with shape-2.
    const halfBound = drawArrow(twoRectangles(), { x: 253, y: 47 }, { x: 305, y: 140 });
    const bothSelected = click(halfBound, { x: 350, y: 140 }, { shift: true });

    const state = drag(bothSelected, { x: 350, y: 140 }, { x: 354, y: 144 }, { alt: true });

    expect(boundsById(state)["shape-2"]).toEqual({ x: 300, y: 100, width: 100, height: 80 });
  });

  test("Delete removes it", () => {
    expect(arrows(press(boundArrow(), "Delete"))).toEqual([]);
  });

  test("undoing the delete brings it back", () => {
    expect(arrows(undo(press(boundArrow(), "Delete")))).toEqual(arrows(boundArrow()));
  });

  test("undoing drawing it removes it", () => {
    expect(arrows(undo(boundArrow()))).toEqual([]);
  });

  test("Enter doesn't open a Label on it", () => {
    expect(currentInteraction(press(boundArrow(), "Enter"))).toEqual({ kind: "idle" });
  });

  test("double-clicking it doesn't open a Label on it", () => {
    const state = apply(press(boundArrow(), "Escape"), { type: "doubleClick", position: middleOfArrow });

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });

  test("it is drawn in the style chosen", () => {
    const red = apply(twoRectangles(), { type: "changeStyle", style: { strokeColor: "red", strokePattern: "dashed" } });

    const svg = svgText(rendering(drawArrow(red, { x: 195, y: 130 }, { x: 305, y: 140 })));

    expect(svg).toMatch(/<g data-shape="shape-3"[^>]*><path d="M 200 130 L 300 140"[^>]*stroke-dasharray/);
  });
});

describe("Ports", () => {
  function hover(state: EditorState, at: Point): EditorState {
    return apply(state, selectTool("arrow"), pointerMove(at));
  }

  const shape1Ports = [
    { x: 150, y: 100 },
    { x: 200, y: 140 },
    { x: 150, y: 180 },
    { x: 100, y: 140 },
  ];

  test("are shown on a Shape hovered with the Arrow tool", () => {
    expect(visiblePorts(hover(twoRectangles(), { x: 150, y: 140 }))).toEqual({
      shape: "shape-1",
      ports: shape1Ports,
      snapsTo: undefined,
    });
  });

  test("show which one an end would snap to", () => {
    expect(visiblePorts(hover(twoRectangles(), { x: 196, y: 142 }))?.snapsTo).toBe(1);
  });

  test("are not shown over empty space", () => {
    expect(visiblePorts(hover(twoRectangles(), { x: 250, y: 300 }))).toBeUndefined();
  });

  test("are not shown when hovering with another tool", () => {
    expect(visiblePorts(apply(twoRectangles(), pointerMove({ x: 150, y: 140 })))).toBeUndefined();
  });

  test("are hidden once the pointer leaves the Sketch", () => {
    expect(visiblePorts(apply(hover(twoRectangles(), { x: 150, y: 140 }), { type: "pointerLeave" }))).toBeUndefined();
  });

  test("are shown on the Shape under the end of an Arrow being drawn", () => {
    const state = drawingArrow({ x: 195, y: 130 }, { x: 340, y: 150 });

    expect(visiblePorts(state)?.shape).toBe("shape-2");
  });

  test("are not shown when an end is pressed but not dragged yet", () => {
    expect(visiblePorts(apply(boundArrow(), pointerDown({ x: 300, y: 140 })))).toBeUndefined();
  });

  test("are shown on the Shape under an end being dragged", () => {
    const state = apply(boundArrow(), pointerDown({ x: 300, y: 140 }), pointerMove({ x: 150, y: 150 }));

    expect(visiblePorts(state)?.shape).toBe("shape-1");
  });
});

describe("rendering Arrows", () => {
  test("shows an Arrow being drawn, from its start to the pointer", () => {
    const state = drawingArrow({ x: 195, y: 130 }, { x: 250, y: 300 });

    expect(svgText(rendering(state))).toContain('d="M 200 130 L 250 300"');
  });

  test("the export draws each Arrow's line", () => {
    const svg = exportSvg(sketch(boundArrow()), fixedWidthTextMeasurer);

    expect(svg).toMatch(/<g data-shape="shape-3"[^>]*><path d="M 200 130 L 300 140"/);
  });

  test("the export is cropped to include floating ends", () => {
    // The Shapes span (100,100)–(400,180) and the Arrow reaches (500,300).
    const state = drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 500, y: 300 });

    expect(exportSvg(sketch(state), fixedWidthTextMeasurer)).toContain('viewBox="80 80 440 240"');
  });
});
