import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { exportSvg } from "./export";
import { fixedWidthTextMeasurer } from "./fakes";
import type { Point } from "./geometry";
import {
  arrows,
  currentInteraction,
  middleSegmentHandle,
  rendering,
  selectionRouting,
  sketch,
  type ArrowView,
} from "./queries";
import { svgText } from "./svg";
import {
  apply,
  click,
  drag,
  drawArrow,
  drawRectangle,
  keyDown,
  newEditor,
  pointerDown,
  pointerMove,
  pointerUp,
  press,
  selectTool,
} from "./test-helpers";

// shape-1 at (100,100)–(200,180) has its Ports at (150,100), (200,140), (150,180) and (100,140). Elbow paths run
// straight out of a Shape for at least 20 before they turn back.

// shape-1, and shape-2 from `from` to `to`.
function withSecond(from: Point, to: Point): EditorState {
  return drawRectangle(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }), from, to);
}

function elbow(state: EditorState): EditorState {
  return apply(state, { type: "changeRouting", routing: "elbow" });
}

// An elbow Arrow drawn from `from` to `to` on shape-1 and a shape-2 drawn from one corner to the other of `second`.
function elbowArrow(second: readonly [Point, Point], from: Point, to: Point): EditorState {
  return elbow(drawArrow(withSecond(...second), from, to));
}

function onlyArrow(state: EditorState): ArrowView {
  const [arrow, ...others] = arrows(state);
  if (!arrow || others.length > 0) throw new Error(`expected one Arrow, got ${arrows(state).length}`);
  return arrow;
}

describe("elbow paths between Ports", () => {
  test("from a right side to a left side turn halfway between them", () => {
    // shape-2 at (300,200)–(400,280), its left Port at (300,240).
    const state = elbowArrow([{ x: 300, y: 200 }, { x: 400, y: 280 }], { x: 198, y: 140 }, { x: 302, y: 240 });

    expect(onlyArrow(state)).toMatchObject({
      routing: "elbow",
      path: [
        { x: 200, y: 140 },
        { x: 250, y: 140 },
        { x: 250, y: 240 },
        { x: 300, y: 240 },
      ],
    });
  });

  test("from a bottom to a top turn halfway between them", () => {
    // shape-2 at (300,300)–(400,380), its top Port at (350,300).
    const state = elbowArrow([{ x: 300, y: 300 }, { x: 400, y: 380 }], { x: 150, y: 178 }, { x: 350, y: 302 });

    expect(onlyArrow(state).path).toEqual([
      { x: 150, y: 180 },
      { x: 150, y: 240 },
      { x: 350, y: 240 },
      { x: 350, y: 300 },
    ]);
  });

  test("from a right side to a top ahead of it turn once", () => {
    // shape-2 at (300,300)–(400,380), its top Port at (350,300).
    const state = elbowArrow([{ x: 300, y: 300 }, { x: 400, y: 380 }], { x: 198, y: 140 }, { x: 350, y: 302 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 350, y: 140 },
      { x: 350, y: 300 },
    ]);
  });

  test("from a right side to a top behind it run out of the side before turning", () => {
    // shape-2 at (0,300)–(80,380), its top Port at (40,300).
    const state = elbowArrow([{ x: 0, y: 300 }, { x: 80, y: 380 }], { x: 198, y: 140 }, { x: 40, y: 302 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 220 },
      { x: 40, y: 220 },
      { x: 40, y: 300 },
    ]);
  });

  test("from a right side to a top above it come down onto the top", () => {
    // shape-2 at (300,-80)–(400,0), its top Port at (350,-80).
    const state = elbowArrow([{ x: 300, y: -80 }, { x: 400, y: 0 }], { x: 198, y: 140 }, { x: 350, y: -78 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 275, y: 140 },
      { x: 275, y: -100 },
      { x: 350, y: -100 },
      { x: 350, y: -80 },
    ]);
  });

  test("from a right side to a left side behind it turn back around", () => {
    // shape-2 at (0,250)–(80,330), its left Port at (0,290).
    const state = elbowArrow([{ x: 0, y: 250 }, { x: 80, y: 330 }], { x: 198, y: 140 }, { x: 2, y: 290 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 215 },
      { x: -20, y: 215 },
      { x: -20, y: 290 },
      { x: 0, y: 290 },
    ]);
  });

  test("from a right side to a left side behind it and level with it go around both Shapes", () => {
    // shape-2 at (-200,100)–(-100,180), its left Port at (-200,140), level with shape-1's right Port.
    const state = elbowArrow([{ x: -200, y: 100 }, { x: -100, y: 180 }], { x: 198, y: 140 }, { x: -198, y: 140 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 80 },
      { x: -220, y: 80 },
      { x: -220, y: 140 },
      { x: -200, y: 140 },
    ]);
  });

  test("from a right side to a left side behind it and nearly level with it go around both Shapes", () => {
    // shape-2 at (-200,110)–(-100,190), its left Port at (-200,150).
    const state = elbowArrow([{ x: -200, y: 110 }, { x: -100, y: 190 }], { x: 198, y: 140 }, { x: -198, y: 150 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 80 },
      { x: -220, y: 80 },
      { x: -220, y: 150 },
      { x: -200, y: 150 },
    ]);
  });

  test("between two right sides nearly level go around both Shapes, not through the further one", () => {
    // shape-2 at (300,110)–(400,190), its right Port at (400,150).
    const state = elbowArrow([{ x: 300, y: 110 }, { x: 400, y: 190 }], { x: 198, y: 140 }, { x: 398, y: 150 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 80 },
      { x: 420, y: 80 },
      { x: 420, y: 150 },
      { x: 400, y: 150 },
    ]);
  });

  test("from a top to a right side whose Shape is in the way go above both Shapes", () => {
    // shape-2 at (260,50)–(360,130), its right Port at (360,90), level with the space just above shape-1's top Port.
    const state = elbowArrow([{ x: 260, y: 50 }, { x: 360, y: 130 }], { x: 150, y: 102 }, { x: 358, y: 90 });

    expect(onlyArrow(state).path).toEqual([
      { x: 150, y: 100 },
      { x: 150, y: 30 },
      { x: 380, y: 30 },
      { x: 380, y: 90 },
      { x: 360, y: 90 },
    ]);
  });

  test("between two right sides less than 20 apart go around, rather than back over the nearer Shape", () => {
    // shape-2 at (210,100)–(310,180), just right of shape-1, its right Port at (310,140).
    const state = elbowArrow([{ x: 210, y: 100 }, { x: 310, y: 180 }], { x: 308, y: 140 }, { x: 198, y: 140 });

    expect(onlyArrow(state).path).toEqual([
      { x: 310, y: 140 },
      { x: 330, y: 140 },
      { x: 330, y: 80 },
      { x: 220, y: 80 },
      { x: 220, y: 140 },
      { x: 200, y: 140 },
    ]);
  });

  test("between two right sides run out past the further one", () => {
    // shape-2 at (300,200)–(400,280), its right Port at (400,240).
    const state = elbowArrow([{ x: 300, y: 200 }, { x: 400, y: 280 }], { x: 198, y: 140 }, { x: 398, y: 240 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 420, y: 140 },
      { x: 420, y: 240 },
      { x: 400, y: 240 },
    ]);
  });

  test("between two tops run out above the higher one", () => {
    // shape-2 at (300,200)–(400,280), its top Port at (350,200).
    const state = elbowArrow([{ x: 300, y: 200 }, { x: 400, y: 280 }], { x: 150, y: 102 }, { x: 350, y: 202 });

    expect(onlyArrow(state).path).toEqual([
      { x: 150, y: 100 },
      { x: 150, y: 80 },
      { x: 350, y: 80 },
      { x: 350, y: 200 },
    ]);
  });

  test("straight across from a right side to a left side is a single segment", () => {
    // shape-2 at (300,100)–(400,180), its left Port at (300,140).
    const state = elbowArrow([{ x: 300, y: 100 }, { x: 400, y: 180 }], { x: 198, y: 140 }, { x: 302, y: 140 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 300, y: 140 },
    ]);
  });
});

describe("elbow paths with floating ends", () => {
  function shape1(): EditorState {
    return drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 });
  }

  test("from a right side to a floating end ahead of it turn halfway", () => {
    const state = elbow(drawArrow(shape1(), { x: 198, y: 140 }, { x: 400, y: 300 }));

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 300, y: 140 },
      { x: 300, y: 300 },
      { x: 400, y: 300 },
    ]);
  });

  test("from a right side to a floating end behind it run out of the side before turning", () => {
    const state = elbow(drawArrow(shape1(), { x: 198, y: 140 }, { x: 50, y: 300 }));

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 300 },
      { x: 50, y: 300 },
    ]);
  });

  test("from a right side to a floating end level with it behind the Shape go around the Shape", () => {
    const state = elbow(drawArrow(shape1(), { x: 198, y: 140 }, { x: 50, y: 140 }));

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 80 },
      { x: 50, y: 80 },
      { x: 50, y: 140 },
    ]);
  });

  test("from a right side to a floating end nearly level with it behind the Shape go around the Shape", () => {
    const state = elbow(drawArrow(shape1(), { x: 198, y: 140 }, { x: 50, y: 170 }));

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 200 },
      { x: 50, y: 200 },
      { x: 50, y: 170 },
    ]);
  });

  test("from a floating start to a top come down onto the top", () => {
    const state = elbow(drawArrow(shape1(), { x: 400, y: 300 }, { x: 150, y: 102 }));

    expect(onlyArrow(state).path).toEqual([
      { x: 400, y: 300 },
      { x: 400, y: 80 },
      { x: 150, y: 80 },
      { x: 150, y: 100 },
    ]);
  });

  test("with both ends floating, wider than high, turn halfway across", () => {
    const state = elbow(drawArrow(newEditor(), { x: 100, y: 400 }, { x: 300, y: 500 }));

    expect(onlyArrow(state).path).toEqual([
      { x: 100, y: 400 },
      { x: 200, y: 400 },
      { x: 200, y: 500 },
      { x: 300, y: 500 },
    ]);
  });

  test("with both ends floating, higher than wide, turn halfway down", () => {
    const state = elbow(drawArrow(newEditor(), { x: 100, y: 400 }, { x: 150, y: 600 }));

    expect(onlyArrow(state).path).toEqual([
      { x: 100, y: 400 },
      { x: 100, y: 500 },
      { x: 150, y: 500 },
      { x: 150, y: 600 },
    ]);
  });
});

// shape-1, and shape-2 at (300,200)–(400,280), with an Arrow, shape-3, from shape-1's right Port at (200,140) to
// shape-2's left Port at (300,240). It is selected.
function crossing(): EditorState {
  return drawArrow(withSecond({ x: 300, y: 200 }, { x: 400, y: 280 }), { x: 198, y: 140 }, { x: 302, y: 240 });
}

describe("switching Routing", () => {
  const straightPath = [
    { x: 200, y: 140 },
    { x: 300, y: 240 },
  ];

  test("to elbow is one undo step", () => {
    const state = press(elbow(crossing()), "z", { meta: true });

    expect(onlyArrow(state)).toMatchObject({ routing: "straight", path: straightPath });
  });

  test("back to straight draws a single segment again", () => {
    const state = apply(elbow(crossing()), { type: "changeRouting", routing: "straight" });

    expect(onlyArrow(state)).toMatchObject({ routing: "straight", path: straightPath });
  });

  test("shows the Routing of the selected Arrows", () => {
    expect(selectionRouting(elbow(crossing()))).toBe("elbow");
  });

  test("shows the selected Arrows as mixed when they differ", () => {
    const another = apply(drawArrow(elbow(crossing()), { x: 100, y: 400 }, { x: 300, y: 500 }), {
      type: "changeRouting",
      routing: "straight",
    });

    expect(selectionRouting(click(another, { x: 250, y: 140 }, { shift: true }))).toBe("mixed");
  });

  test("shows no Routing with only Shapes made from a Symbol selected", () => {
    expect(selectionRouting(click(crossing(), { x: 150, y: 140 }))).toBeUndefined();
  });

  test("leaves the Shapes made from a Symbol among the selection as they are", () => {
    const both = click(crossing(), { x: 150, y: 140 }, { shift: true });

    expect(onlyArrow(elbow(both)).routing).toBe("elbow");
    expect(selectionRouting(elbow(both))).toBe("elbow");
  });

  test("with nothing selected draws the next Arrows with that Routing", () => {
    const chosen = elbow(press(withSecond({ x: 300, y: 200 }, { x: 400, y: 280 }), "Escape"));

    const state = drawArrow(chosen, { x: 198, y: 140 }, { x: 302, y: 240 });

    expect(selectionRouting(chosen)).toBe("elbow");
    expect(onlyArrow(state)).toMatchObject({
      routing: "elbow",
      path: [
        { x: 200, y: 140 },
        { x: 250, y: 140 },
        { x: 250, y: 240 },
        { x: 300, y: 240 },
      ],
    });
  });

  test("of an Arrow changes the Routing the next Arrows are drawn with", () => {
    const state = drawArrow(elbow(crossing()), { x: 100, y: 400 }, { x: 300, y: 500 });

    expect(arrows(state)[1]?.routing).toBe("elbow");
  });
});

describe("the middle segment", () => {
  // crossing() as an elbow Arrow, from (200,140) right to (250,140), down to (250,240) and right to (300,240). Its
  // middle segment is the one down, with its handle at (250,190).
  function elbowCrossing(): EditorState {
    return elbow(crossing());
  }

  const handle = { x: 250, y: 190 };

  // The elbow Arrow's path with its middle segment at `x`.
  function middleAt(x: number, end = { x: 300, y: 240 }) {
    return [{ x: 200, y: 140 }, { x, y: 140 }, { x, y: end.y }, end];
  }

  test("of a selected elbow Arrow has a handle halfway along it, dragged sideways", () => {
    expect(middleSegmentHandle(elbowCrossing())).toEqual({ position: handle, axis: "x" });
  });

  test("of a level middle segment is dragged up and down", () => {
    // shape-2 at (300,300)–(400,380), with an Arrow from shape-1's bottom Port to shape-2's top Port, its middle
    // segment from (150,240) to (350,240).
    const state = elbowArrow([{ x: 300, y: 300 }, { x: 400, y: 380 }], { x: 150, y: 178 }, { x: 350, y: 302 });

    expect(middleSegmentHandle(state)).toEqual({ position: { x: 250, y: 240 }, axis: "y" });
  });

  test("has no handle on a straight Arrow", () => {
    expect(middleSegmentHandle(crossing())).toBeUndefined();
  });

  test("has no handle on an elbow path with a single turn", () => {
    const state = elbowArrow([{ x: 300, y: 300 }, { x: 400, y: 380 }], { x: 198, y: 140 }, { x: 350, y: 302 });

    expect(middleSegmentHandle(state)).toBeUndefined();
  });

  test("has no handle on an Arrow selected with other Shapes", () => {
    expect(middleSegmentHandle(click(elbowCrossing(), { x: 150, y: 140 }, { shift: true }))).toBeUndefined();
  });

  test("dragged sideways moves it, and only sideways", () => {
    const state = drag(elbowCrossing(), handle, { x: 230, y: 170 });

    expect(onlyArrow(state).path).toEqual(middleAt(230));
  });

  test("shows which Arrow's middle segment is being dragged", () => {
    const state = apply(elbowCrossing(), pointerDown(handle), pointerMove({ x: 230, y: 170 }));

    expect(currentInteraction(state)).toEqual({ kind: "draggingElbowSegment", arrowId: "shape-3" });
  });

  test("dragged past an end stops 10 short of it, so the path never doubles back", () => {
    expect(onlyArrow(drag(elbowCrossing(), handle, { x: 100, y: 190 })).path).toEqual(middleAt(210));
    expect(onlyArrow(drag(elbowCrossing(), handle, { x: 400, y: 190 })).path).toEqual(middleAt(290));
  });

  test("going around both Shapes, dragged level with the ends stops 10 short of them", () => {
    // shape-2 at (-200,100)–(-100,180), with an Arrow from shape-1's right Port at (200,140) around the top of both
    // Shapes to shape-2's left Port at (-200,140). Its middle segment runs from (220,80) to (-220,80).
    const around = elbowArrow([{ x: -200, y: 100 }, { x: -100, y: 180 }], { x: 198, y: 140 }, { x: -198, y: 140 });

    const state = drag(around, { x: 0, y: 80 }, { x: 0, y: 135 });

    expect(onlyArrow(state).path).toEqual([
      { x: 200, y: 140 },
      { x: 220, y: 140 },
      { x: 220, y: 130 },
      { x: -220, y: 130 },
      { x: -220, y: 140 },
      { x: -200, y: 140 },
    ]);
  });

  test("dragged towards an end it can't come within 10 of stops on the near side of the other end", () => {
    // shape-2 at (300,150)–(400,230), with an Arrow from shape-1's left Port at (100,140) out to (80,140), up to
    // (80,80) above both Shapes, across to (350,80) and down to shape-2's top Port at (350,150). The middle segment can
    // come no closer than 10 to that Port, nor to the level of the Port it started from.
    const around = elbowArrow([{ x: 300, y: 150 }, { x: 400, y: 230 }], { x: 102, y: 140 }, { x: 350, y: 152 });

    const state = drag(around, { x: 215, y: 80 }, { x: 215, y: 145 });

    expect(onlyArrow(state).path).toEqual([
      { x: 100, y: 140 },
      { x: 80, y: 140 },
      { x: 80, y: 130 },
      { x: 350, y: 130 },
      { x: 350, y: 150 },
    ]);
  });

  test("dragging it is one undo step", () => {
    const state = press(drag(elbowCrossing(), handle, { x: 230, y: 190 }), "z", { meta: true });

    expect(arrows(state)).toEqual(arrows(elbowCrossing()));
  });

  test("Escape while dragging it puts it back", () => {
    const dragging = apply(elbowCrossing(), pointerDown(handle), pointerMove({ x: 230, y: 190 }));

    expect(arrows(apply(dragging, keyDown("Escape")))).toEqual(arrows(elbowCrossing()));
  });

  test("keeps its offset when a bound Shape moves a little", () => {
    const dragged = drag(elbowCrossing(), handle, { x: 230, y: 190 });

    // Moving shape-2 20 to the right moves the halfway point 10, and the middle segment with it.
    const state = drag(dragged, { x: 350, y: 240 }, { x: 370, y: 240 });

    expect(onlyArrow(state).path).toEqual(middleAt(240, { x: 320, y: 240 }));
  });

  test("goes back halfway once a bound Shape moves so far that the offset would make the path double back", () => {
    const dragged = drag(elbowCrossing(), handle, { x: 280, y: 190 });

    // Moving shape-2 40 to the left puts its left Port at (260,240), and the halfway point at 230, which would put the
    // middle segment at 260, on the Port.
    const state = drag(dragged, { x: 350, y: 240 }, { x: 310, y: 240 });

    expect(onlyArrow(state).path).toEqual(middleAt(230, { x: 260, y: 240 }));
  });

  test("stays halfway once its offset is reset, even when the Shape moves back", () => {
    const reset = drag(drag(elbowCrossing(), handle, { x: 280, y: 190 }), { x: 350, y: 240 }, { x: 310, y: 240 });

    const state = drag(reset, { x: 310, y: 240 }, { x: 350, y: 240 });

    expect(onlyArrow(state).path).toEqual(middleAt(250));
  });

  test("keeps its offset when the Shape moves back within the same drag", () => {
    const dragged = drag(elbowCrossing(), handle, { x: 280, y: 190 });

    const state = apply(
      dragged,
      pointerDown({ x: 350, y: 240 }),
      pointerMove({ x: 310, y: 240 }),
      pointerMove({ x: 350, y: 240 }),
      pointerUp({ x: 350, y: 240 }),
    );

    expect(onlyArrow(state).path).toEqual(middleAt(280));
  });

  test("loses its offset when the Arrow is switched to straight and back", () => {
    const dragged = drag(elbowCrossing(), handle, { x: 230, y: 190 });

    const state = elbow(apply(dragged, { type: "changeRouting", routing: "straight" }));

    expect(onlyArrow(state).path).toEqual(middleAt(250));
  });

  test("keeps its offset when an Arrow with both ends floating is moved", () => {
    // From (100,400) right to (200,400), down to (200,500) and right to (300,500), its handle at (200,450).
    const floating = elbow(drawArrow(newEditor(), { x: 100, y: 400 }, { x: 300, y: 500 }));
    const dragged = drag(floating, { x: 200, y: 450 }, { x: 170, y: 450 });

    const state = drag(dragged, { x: 135, y: 400 }, { x: 135, y: 420 });

    expect(onlyArrow(state).path).toEqual([
      { x: 100, y: 420 },
      { x: 170, y: 420 },
      { x: 170, y: 520 },
      { x: 300, y: 520 },
    ]);
  });
});

describe("rendering elbow Arrows", () => {
  test("draws the path with its turns", () => {
    expect(svgText(rendering(elbow(crossing())))).toContain('d="M 200 140 L 250 140 L 250 240 L 300 240"');
  });

  test("draws an elbow Arrow being drawn with its turns", () => {
    const chosen = elbow(press(withSecond({ x: 300, y: 200 }, { x: 400, y: 280 }), "Escape"));

    const state = apply(chosen, selectTool("arrow"), pointerDown({ x: 198, y: 140 }), pointerMove({ x: 302, y: 240 }));

    expect(svgText(rendering(state))).toContain('d="M 200 140 L 250 140 L 250 240 L 300 240"');
  });

  test("the export draws the path with its turns", () => {
    expect(exportSvg(sketch(elbow(crossing())), fixedWidthTextMeasurer)).toContain(
      'd="M 200 140 L 250 140 L 250 240 L 300 240"',
    );
  });
});
