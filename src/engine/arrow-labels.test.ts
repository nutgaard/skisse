import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { exportSvg } from "./export";
import { fixedWidthTextMeasurer } from "./fakes";
import { arrows, currentInteraction, labelLayout, rendering, selection, sketch, type ArrowView } from "./queries";
import { svgText, type SvgElement } from "./svg";
import {
  apply,
  click,
  doubleClick,
  drag,
  drawArrow,
  drawRectangle,
  keyDown,
  newEditor,
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

// The elements drawn for shape-3, in the order drawn.
function arrowElements(state: EditorState): readonly SvgElement[] {
  const descendants = (element: SvgElement): readonly SvgElement[] =>
    element.children.flatMap((child) => (typeof child === "string" ? [] : [child, ...descendants(child)]));
  const group = descendants(rendering(state)).find(({ attributes }) => attributes["data-shape"] === "shape-3");
  return group ? descendants(group) : [];
}

describe("drawing an Arrow's Label", () => {
  test("draws each line centred on its place, in the Arrow's colour and font size", () => {
    const state = withLabel(apply(boundArrow(), { type: "changeStyle", style: { strokeColor: "blue" } }), "HTTPS");

    const texts = arrowElements(state).filter(({ tag }) => tag === "text");

    expect(texts).toHaveLength(1);
    expect(texts[0]).toMatchObject({
      attributes: { x: 250, y: 135, "text-anchor": "middle", "font-size": 20, fill: "#1971c2" },
      children: ["HTTPS"],
    });
  });

  test("draws a white background behind the text, above the line and its heads, so they don't run through it", () => {
    const elements = arrowElements(withLabel(boundArrow(), "HTTPS"));
    const background = elements.findIndex(({ attributes }) => attributes["data-label-background"] !== undefined);
    const box = elements[background]?.attributes;

    expect(box).toMatchObject({ fill: "#ffffff" });
    // Around the line of text, from (225,122.5) to (275,147.5).
    expect(Number(box?.x)).toBeLessThanOrEqual(225);
    expect(Number(box?.y)).toBeLessThanOrEqual(122.5);
    expect(Number(box?.x) + Number(box?.width)).toBeGreaterThanOrEqual(275);
    expect(Number(box?.y) + Number(box?.height)).toBeGreaterThanOrEqual(147.5);
    expect(elements.slice(0, background).map(({ tag }) => tag)).toEqual(["path", "path"]);
    expect(elements.slice(background + 1).map(({ tag }) => tag)).toEqual(["text"]);
  });

  test("draws nothing for an empty Label", () => {
    expect(arrowElements(boundArrow()).map(({ tag }) => tag)).toEqual(["path", "path"]);
  });

  test("leaves out the text of the Label being edited, as its text field shows it instead, but keeps the background", () => {
    const editing = typeLabel(press(withLabel(boundArrow(), "HTTPS"), "Enter"), "HTTPS and more");

    expect(arrowElements(editing).map(({ tag }) => tag)).toEqual(["path", "path", "rect"]);
  });

  test("tells where the Label's background is, so the selection can leave it out", () => {
    expect(onlyArrow(withLabel(boundArrow(), "HTTPS")).label.background).toEqual({
      x: 221,
      y: 118.5,
      width: 58,
      height: 33,
    });
    expect(onlyArrow(boundArrow()).label.background).toBeUndefined();
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
    const state = drag(labelledElbow(), onLabel, { x: 265, y: 215 });

    expect(onlyArrow(state).label).toMatchObject({ text: "HTTPS", along: 0.625, at: { x: 250, y: 215 } });
  });

  test("moves it as far along as the pointer went, wherever on the Label it was grabbed", () => {
    const state = drag(labelledElbow(), onLabelBesideLine, { x: 270, y: 200 });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.6, at: { x: 250, y: 210 } });
  });

  test("past the end stops it at the end", () => {
    const state = drag(labelledElbow(), onLabel, { x: 415, y: 400 });

    expect(onlyArrow(state).label).toMatchObject({ along: 1, at: { x: 300, y: 240 } });
  });

  test("past the start stops it at the start", () => {
    const state = drag(labelledElbow(), onLabel, { x: 115, y: 100 });

    expect(onlyArrow(state).label).toMatchObject({ along: 0, at: { x: 200, y: 140 } });
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
      pointerMove({ x: 265, y: 215 }),
    );

    expect(currentInteraction(state)).toEqual({ kind: "draggingArrowLabel", arrowId: "shape-3" });
  });

  test("is one undo step", () => {
    const state = apply(drag(labelledElbow(), onLabel, { x: 265, y: 215 }), undoInput);

    expect(onlyArrow(state).label).toMatchObject({ text: "HTTPS", along: 0.5 });
  });

  test("Escape while dragging puts it back", () => {
    const dragging = apply(
      labelledElbow(),
      selectTool("select"),
      pointerDown(onLabel),
      pointerMove({ x: 265, y: 215 }),
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

  test("an empty Label can't be grabbed, so a press where it would be, away from the line, hits nothing", () => {
    const state = click(press(elbowCrossing(), "Escape"), onLabelBesideLine);

    expect(selection(state)).toEqual([]);
  });

  test("double-clicking the Label away from the line edits it", () => {
    const state = doubleClick(press(labelledElbow(), "Escape"), onLabelBesideLine);

    expect(currentInteraction(state)).toEqual({ kind: "editingLabel", shapeId: "shape-3" });
  });

  test("the export is cropped to the Label too, where it reaches past the line", () => {
    // A floating Arrow from (100,100) to (300,100), with its Label 270 wide centred at (200,100).
    const state = withLabel(drawArrow(newEditor(), { x: 100, y: 100 }, { x: 300, y: 100 }), "a".repeat(27));

    const svg = exportSvg(sketch(state), fixedWidthTextMeasurer);

    // The Label's background, from (61,83.5) to (339,116.5), with a margin of 20 around it.
    expect(svg).toContain('viewBox="41 63.5 318 73"');
  });
});

describe("an Arrow's Label when the Arrow changes", () => {
  // labelledElbow() with its Label dragged 0.625 of the way along.
  function draggedAlong(): EditorState {
    return drag(labelledElbow(), onLabel, { x: 265, y: 215 });
  }

  test("stays at the same share of the path when a bound Shape moves", () => {
    // shape-2 moves down to (300,300)–(400,380), so the path runs down to (250,340), and is 300 long.
    const state = drag(draggedAlong(), { x: 380, y: 260 }, { x: 380, y: 360 });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.625, at: { x: 250, y: 277.5 } });
  });

  test("stays at the same share of the path when its Routing changes", () => {
    const state = apply(draggedAlong(), { type: "changeRouting", routing: "straight" });

    expect(onlyArrow(state).label).toMatchObject({ along: 0.625, at: { x: 262.5, y: 202.5 } });
  });
});
