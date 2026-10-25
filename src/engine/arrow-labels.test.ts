import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { exportSvg } from "./export";
import { fixedWidthTextMeasurer } from "./fakes";
import { arrows, currentInteraction, labelLayout, rendering, selection, sketch, type ArrowView } from "./queries";
import { svgText, type SvgElement } from "./svg";
import {
  apply,
  boundsById,
  click,
  doubleClick,
  drag,
  drawArrow,
  drawRectangle,
  keyDown,
  newEditor,
  pinch,
  pointerDown,
  pointerMove,
  press,
  selectTool,
  twoRectangles,
  typeLabel,
  undoInput,
} from "./test-helpers";

// An Arrow, shape-3, from the right side of shape-1 at (200,130) to the left Port of shape-2 at (300,140). It is
// selected.
function boundArrow(): EditorState {
  return drawArrow(twoRectangles(), { x: 195, y: 130 }, { x: 305, y: 140 });
}

// A floating Arrow, shape-1, from (150,135) to (350,135), long enough for a short Label halfway along, at (250,135), to
// keep clear of its ends. It is selected.
function longArrow(): EditorState {
  return drawArrow(newEditor(), { x: 150, y: 135 }, { x: 350, y: 135 });
}

// shape-1 at (100,100)–(200,180) and shape-2 at (300,200)–(400,280), with an elbow Arrow, shape-3, from shape-1's
// right Port at (200,140) right to (250,140), down to (250,240) and right to shape-2's left Port at (300,240): 200
// long in all. It is selected.
function elbowCrossing(): EditorState {
  const shapes = drawRectangle(
    drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 }),
    { x: 300, y: 200 },
    { x: 400, y: 280 },
  );
  const arrow = drawArrow(shapes, { x: 198, y: 140 }, { x: 302, y: 240 });
  return apply(arrow, { type: "changeRouting", routing: "elbow" });
}

// The one selected Arrow with its Label set to `text`, edited by pressing Enter and committed with Escape.
function withLabel(state: EditorState, text: string): EditorState {
  return press(typeLabel(press(state, "Enter"), text), "Escape");
}

function onlyArrow(state: EditorState): ArrowView {
  const [arrow, ...others] = arrows(state);
  if (!arrow || others.length > 0) throw new Error(`expected one Arrow, got ${arrows(state).length}`);
  return arrow;
}

describe("where an Arrow's Label is", () => {
  test("a new Arrow has an empty Label halfway along a straight path", () => {
    expect(onlyArrow(boundArrow()).label).toEqual({ text: "", along: 0.5, at: { x: 250, y: 135 } });
  });

  test("halfway along an elbow path is halfway along its length, not between its ends", () => {
    expect(onlyArrow(elbowCrossing()).label).toEqual({ text: "", along: 0.5, at: { x: 250, y: 190 } });
  });
});

describe("editing an Arrow's Label", () => {
  test("double-clicking an Arrow selects it and starts editing its Label", () => {
    const state = doubleClick(press(boundArrow(), "Escape"), { x: 250, y: 135 });

    expect(currentInteraction(state)).toEqual({ kind: "editingLabel", shapeId: "shape-3" });
    expect(selection(state)).toEqual(["shape-3"]);
  });

  test("Enter on the one selected Arrow starts editing its Label", () => {
    expect(currentInteraction(press(boundArrow(), "Enter"))).toEqual({ kind: "editingLabel", shapeId: "shape-3" });
  });

  test("Escape commits the typed text", () => {
    const state = press(typeLabel(press(boundArrow(), "Enter"), "HTTPS"), "Escape");

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
    expect(onlyArrow(state).label.text).toBe("HTTPS");
  });

  test("clicking outside commits the typed text", () => {
    const state = click(typeLabel(press(boundArrow(), "Enter"), "HTTPS"), { x: 500, y: 500 });

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
    expect(onlyArrow(state).label.text).toBe("HTTPS");
  });

  test("cancelling puts back the text from before", () => {
    const editing = typeLabel(press(withLabel(boundArrow(), "HTTPS"), "Enter"), "gRPC");

    const cancelled = apply(editing, { type: "cancelLabel" });

    expect(currentInteraction(cancelled)).toEqual({ kind: "idle" });
    expect(onlyArrow(cancelled).label.text).toBe("HTTPS");
  });

  test("one editing session undoes as one step, however many changes were typed", () => {
    const edited = press(typeLabel(typeLabel(typeLabel(press(boundArrow(), "Enter"), "H"), "HT"), "HTTPS"), "Escape");

    const undone = apply(edited, undoInput);

    expect(onlyArrow(undone).label.text).toBe("");
  });

  test("leaving the Label empty keeps the Arrow, and adds no undo step", () => {
    const state = press(typeLabel(press(boundArrow(), "Enter"), ""), "Escape");

    expect(onlyArrow(state).label.text).toBe("");
    expect(arrows(apply(state, undoInput))).toEqual([]);
  });

  test("lays the Label out centred on its point, a line for each line typed, without wrapping", () => {
    // Every character is 10 wide at the medium font size, and a line is 25 high.
    const state = withLabel(boundArrow(), "HTTPS\nJSON over a long way");

    expect(labelLayout(state, "shape-3")).toMatchObject({
      text: "HTTPS\nJSON over a long way",
      alignment: { horizontal: "center", vertical: "middle" },
      fontPixels: 20,
      lineHeight: 25,
      lines: [
        { text: "HTTPS", bounds: { x: 225, y: 110, width: 50, height: 25 } },
        { text: "JSON over a long way", bounds: { x: 150, y: 135, width: 200, height: 25 } },
      ],
    });
  });
});

// The elements drawn for the Arrow `id`, in the order drawn.
function arrowElements(state: EditorState, id = "shape-3"): readonly SvgElement[] {
  const descendants = (element: SvgElement): readonly SvgElement[] =>
    element.children.flatMap((child) => (typeof child === "string" ? [] : [child, ...descendants(child)]));
  const group = descendants(rendering(state)).find(({ attributes }) => attributes["data-shape"] === id);
  return group ? descendants(group) : [];
}

describe("drawing an Arrow's Label", () => {
  test("draws each line centred on its place, in the Arrow's colour and font size", () => {
    const state = withLabel(apply(longArrow(), { type: "changeStyle", style: { strokeColor: "blue" } }), "HTTPS");

    const texts = arrowElements(state, "shape-1").filter(({ tag }) => tag === "text");

    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({
      attributes: { x: 250, y: 135, "text-anchor": "middle", "font-size": 20, fill: "#1971c2" },
      children: ["HTTPS"],
    });
  });

  test("outlines the text thinly in white, under its fill, so it stays readable where it crosses a Shape's lines", () => {
    const state = withLabel(longArrow(), "HTTPS");

    const [text] = arrowElements(state, "shape-1").filter(({ tag }) => tag === "text");

    expect(text?.attributes).toMatchObject({
      stroke: "#ffffff",
      "stroke-width": 2,
      "stroke-linejoin": "round",
      "paint-order": "stroke",
    });
  });

  test("keeps the outline as thin on screen at any zoom", () => {
    const zoomedIn = apply(withLabel(longArrow(), "HTTPS"), pinch({ x: 0, y: 0 }, 4));

    const [text] = arrowElements(zoomedIn, "shape-1").filter(({ tag }) => tag === "text");

    expect(text?.attributes["stroke-width"]).toBe(0.5);
  });

  test("outlines the text in the export as on screen at 100%", () => {
    const zoomedIn = apply(withLabel(longArrow(), "HTTPS"), pinch({ x: 0, y: 0 }, 4));

    expect(exportSvg(sketch(zoomedIn), fixedWidthTextMeasurer)).toContain('stroke="#ffffff" stroke-width="2"');
  });

  test("leaves the line out around the text, so it doesn't run through it, but covers nothing behind it", () => {
    const elements = arrowElements(withLabel(longArrow(), "HTTPS"), "shape-1");
    const clip = elements.find(({ tag }) => tag === "clipPath");
    const clipped = elements.find(({ attributes }) => attributes["clip-path"] !== undefined);
    const [hole] = clip?.children ?? [];

    expect(clipped?.attributes["clip-path"]).toBe(`url(#${clip?.attributes.id})`);
    expect(clipped?.children.map((child) => typeof child !== "string" && child.tag)).toEqual(["path"]);
    // The gap around the line of text, from (221,118.5) to (279,151.5), cut out of a region around the whole line.
    expect(typeof hole !== "string" && hole?.attributes).toMatchObject({ "clip-rule": "evenodd" });
    expect(typeof hole !== "string" && String(hole?.attributes.d)).toContain(
      "M 221 118.5 L 279 118.5 L 279 151.5 L 221 151.5 Z",
    );
    expect(elements.some(({ tag }) => tag === "rect")).toBe(false);
  });

  test("draws nothing for an empty Label", () => {
    expect(arrowElements(boundArrow()).map(({ tag }) => tag)).toEqual(["path", "path"]);
  });

  test("leaves out the text of the Label being edited, as its text field shows it instead, but keeps the gap", () => {
    const editing = typeLabel(press(withLabel(boundArrow(), "HTTPS"), "Enter"), "HTTPS and more");
    const tags = arrowElements(editing).map(({ tag }) => tag);

    expect(tags).not.toContain("text");
    expect(tags).toContain("clipPath");
  });

  test("tells where the gap in the line around the Label is, so the selection can leave it out", () => {
    expect(onlyArrow(withLabel(longArrow(), "HTTPS")).label.gap).toEqual({
      x: 221,
      y: 118.5,
      width: 58,
      height: 33,
    });
    expect(onlyArrow(boundArrow()).label.gap).toBeUndefined();
  });

  test("the export draws the Label as on screen", () => {
    const state = press(withLabel(boundArrow(), "HTTPS"), "Escape");

    expect(exportSvg(sketch(state), fixedWidthTextMeasurer)).toContain(svgText(rendering(state)));
  });
});

// elbowCrossing() with the Label "HTTPS" halfway along at (250,190), its text from (225,177.5) to (275,202.5), on
// the path's middle segment, which runs down from (250,140) to (250,240). The middle segment's handle, also at
// (250,190), is grabbed rather than the Label under it, so the Label is grabbed beside it.
function labelledElbow(): EditorState {
  return withLabel(elbowCrossing(), "HTTPS");
}

// Points on the Label, but too far from the line to hit it.
const onLabel = { x: 265, y: 190 };
const onLabelBesideLine = { x: 270, y: 180 };

describe("dragging an Arrow's Label", () => {
  test("along the path stores how far along it is, as a share of the path's length", () => {
    const state = drag(labelledElbow(), onLabel, { x: 265, y: 210 });

    expect(onlyArrow(state).label).toMatchObject({ text: "HTTPS", along: 0.6, at: { x: 250, y: 210 } });
  });

  test("moves it as far along as the pointer went, wherever on the Label it was grabbed", () => {
    const state = drag(labelledElbow(), onLabelBesideLine, { x: 270, y: 190 });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.55, at: { x: 250, y: 200 } });
  });

  // The gap around the Label is 58 wide and 33 high. It stays clear of each end by as far as the head there reaches
  // back along the line, 12 for an arrow, and 12 more.

  test("past the end stops it short of the end, clear of the arrow there and the Shape it points at", () => {
    const state = drag(labelledElbow(), onLabel, { x: 415, y: 400 });

    // The gap's corner at (279,227.5) is 24 from the end at (300,240).
    expect(onlyArrow(state).label).toMatchObject({ along: 0.605, at: { x: 250, y: 211 } });
  });

  test("past the start stops it short of the start, which has no head", () => {
    const state = drag(labelledElbow(), onLabel, { x: 115, y: 100 });

    // The gap's left side at 212 is 12 from the start at (200,140).
    expect(onlyArrow(state).label).toMatchObject({ along: 0.205, at: { x: 241, y: 140 } });
  });

  test("past the end stops it further short of a longer head", () => {
    const diamond = apply(labelledElbow(), { type: "changeArrowhead", end: "end", arrowhead: "diamond" });

    const state = drag(diamond, onLabel, { x: 415, y: 400 });

    // The gap's corner at (279,210.5) is 36 from the end, as a diamond reaches 24 back along the line.
    expect(onlyArrow(state).label).toMatchObject({ along: 0.52, at: { x: 250, y: 194 } });
  });

  test("on an Arrow too short to keep the Label clear of both ends shows it in the middle, but keeps its share", () => {
    // A floating Arrow from (100,100) to (160,100).
    const short = withLabel(drawArrow(newEditor(), { x: 100, y: 100 }, { x: 160, y: 100 }), "HTTPS");

    const state = drag(short, { x: 130, y: 110 }, { x: 160, y: 110 });

    expect(onlyArrow(state).label).toMatchObject({ along: 1, at: { x: 130, y: 100 } });
  });

  test("past the start stops it clear of the Shape there, not just of the end on it", () => {
    // shape-1 at (100,100)–(200,180), with an Arrow from its right Port at (200,140) steeply down to a floating end at
    // (260,400), and a Label 180 wide, which would reach back over shape-1 if it only kept clear of the end.
    const shape = drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 });
    const labelled = withLabel(drawArrow(shape, { x: 198, y: 140 }, { x: 260, y: 400 }), "a".repeat(18));

    const state = drag(labelled, { x: 300, y: 275 }, { x: 100, y: 0 });
    const { gap, along } = onlyArrow(state).label;

    // Below shape-1, by the same 12 that shows of the line beside a Label at an end without a head.
    expect(gap?.y).toBeGreaterThanOrEqual(192);
    expect(gap?.y).toBeLessThan(193);
    expect(along).toBeLessThan(0.3);
  });

  test("away from the line keeps it on the line, at the point nearest the pointer", () => {
    const state = drag(labelledElbow(), onLabel, { x: 245, y: 200 });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.55, at: { x: 250, y: 200 } });
  });

  test("shows which Arrow's Label is being dragged", () => {
    const state = apply(
      labelledElbow(),
      selectTool("select"),
      pointerDown(onLabel),
      pointerMove({ x: 265, y: 210 }),
    );

    expect(currentInteraction(state)).toEqual({ kind: "draggingArrowLabel", arrowId: "shape-3" });
  });

  test("is one undo step", () => {
    const state = apply(drag(labelledElbow(), onLabel, { x: 265, y: 210 }), undoInput);

    expect(onlyArrow(state).label).toMatchObject({ text: "HTTPS", along: 0.5 });
  });

  test("Escape while dragging puts it back", () => {
    const dragging = apply(
      labelledElbow(),
      selectTool("select"),
      pointerDown(onLabel),
      pointerMove({ x: 265, y: 210 }),
    );

    const state = apply(dragging, keyDown("Escape"));

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
    expect(onlyArrow(state).label.along).toBe(0.5);
  });

  test("a click on it selects the Arrow alone, and leaves the Label where it was", () => {
    const otherSelected = click(labelledElbow(), { x: 150, y: 140 });

    const state = click(otherSelected, onLabelBesideLine);

    expect(selection(state)).toEqual(["shape-3"]);
    expect(onlyArrow(state).label.along).toBe(0.5);
  });

  test("on an Arrow selected with other Shapes moves them all, as a drag anywhere on the Arrow does", () => {
    const both = click(labelledElbow(), { x: 150, y: 140 }, { shift: true });

    const state = drag(both, onLabelBesideLine, { x: 270, y: 280 });

    expect(selection(state)).toEqual(["shape-3", "shape-1"]);
    expect(boundsById(state)["shape-1"]).toEqual({ x: 100, y: 200, width: 100, height: 80 });
    expect(onlyArrow(state).label.along).toBe(0.5);
  });

  test("a click on it, on an Arrow selected with other Shapes, selects the Arrow alone", () => {
    const both = click(labelledElbow(), { x: 150, y: 140 }, { shift: true });

    expect(selection(click(both, onLabelBesideLine))).toEqual(["shape-3"]);
  });

  test("an empty Label can't be grabbed, so a press where it would be, away from the line, hits nothing", () => {
    const state = click(press(elbowCrossing(), "Escape"), onLabelBesideLine);

    expect(selection(state)).toEqual([]);
  });

  test("double-clicking the Label away from the line edits it", () => {
    const state = doubleClick(press(labelledElbow(), "Escape"), onLabelBesideLine);

    expect(currentInteraction(state)).toEqual({ kind: "editingLabel", shapeId: "shape-3" });
  });

  test("the export is cropped to the Label too, where it reaches past the line", () => {
    // A floating Arrow from (100,100) to (300,100), with its Label 270 wide centred at (200,100), as it is too wide to
    // keep clear of the ends anywhere.
    const state = withLabel(drawArrow(newEditor(), { x: 100, y: 100 }, { x: 300, y: 100 }), "a".repeat(27));

    const svg = exportSvg(sketch(state), fixedWidthTextMeasurer);

    // The gap around the Label, from (61,83.5) to (339,116.5), with a margin of 20 around it.
    expect(svg).toContain('viewBox="41 63.5 318 73"');
  });
});

describe("an Arrow's Label when the Arrow changes", () => {
  // labelledElbow() with its Label dragged 0.55 of the way along.
  function draggedAlong(): EditorState {
    return drag(labelledElbow(), onLabel, { x: 265, y: 200 });
  }

  test("stays at the same share of the path when a bound Shape moves", () => {
    // shape-2 moves down to (300,300)–(400,380), so the path runs down to (250,340), and is 300 long.
    const state = drag(draggedAlong(), { x: 380, y: 260 }, { x: 380, y: 360 });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.55, at: { x: 250, y: 255 } });
  });

  test("stays at the same share of the path when an Arrow with both ends floating is moved", () => {
    // A floating Arrow from (100,100) right to (300,100), with its Label dragged a quarter of the way along, to
    // (150,100).
    const drawn = withLabel(drawArrow(newEditor(), { x: 100, y: 100 }, { x: 300, y: 100 }), "HTTPS");
    const labelled = drag(drawn, { x: 200, y: 110 }, { x: 150, y: 110 });

    const state = drag(labelled, { x: 250, y: 100 }, { x: 250, y: 160 });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.25, at: { x: 150, y: 160 } });
  });

  test("is shown clear of an end that comes too close, and back at its share once there is room again", () => {
    // A floating Arrow from (100,100) to (300,100), with its Label dragged to 0.7 of the way along, to (240,100), its
    // gap 31 short of the end.
    const drawn = withLabel(drawArrow(newEditor(), { x: 100, y: 100 }, { x: 300, y: 100 }), "HTTPS");
    const labelled = drag(drawn, { x: 200, y: 110 }, { x: 240, y: 110 });

    const shortened = drag(labelled, { x: 300, y: 100 }, { x: 270, y: 100 });
    const lengthened = drag(shortened, { x: 270, y: 100 }, { x: 300, y: 100 });

    // At 0.7 of the way along, at (219,100), its gap would be 22 short of the end, where 24 is needed.
    expect(onlyArrow(shortened).label).toMatchObject({ along: 0.7, at: { x: 217, y: 100 } });
    expect(onlyArrow(lengthened).label).toMatchObject({ along: 0.7, at: { x: 240, y: 100 } });
  });

  test("a floating Arrow dragged with snapping on snaps by its line, not by its Label", () => {
    // A floating Arrow from (103,104) down to (103,404), with a Label 100 wide halfway along, whose gap reaches left of
    // the line to 49.
    const labelled = withLabel(drawArrow(newEditor(), { x: 103, y: 104 }, { x: 103, y: 404 }), "a".repeat(10));

    const state = drag(labelled, { x: 103, y: 150 }, { x: 103, y: 200 }, { alt: true });

    expect(onlyArrow(state).start.point).toEqual({ x: 100, y: 150 });
  });

  test("stays at the same share of the path when its Routing changes", () => {
    const state = apply(draggedAlong(), { type: "changeRouting", routing: "straight" });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.55, at: { x: 255, y: 195 } });
  });
});
