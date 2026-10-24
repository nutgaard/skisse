import { describe, expect, test } from "vitest";
import { canUndo, currentInteraction, labelLayout, resizeHandles, selection, shapes } from "./queries";
import type { EditorState } from "./editor";
import type { Point } from "./geometry";
import {
  apply,
  click,
  doubleClick,
  drag,
  drawRectangle,
  newEditor,
  press,
  drawLabelled,
  drawWithLabelOpen,
  typeLabel,
  undoInput,
} from "./test-helpers";

describe("editing a Label", () => {
  test("starts right after a Shape is created, and Escape commits the typed text", () => {
    const created = drawWithLabelOpen(newEditor(), "ellipse", { x: 100, y: 100 }, { x: 300, y: 200 });

    expect(currentInteraction(created)).toEqual({ kind: "editingLabel", shapeId: "shape-1" });

    const committed = press(typeLabel(created, "API"), "Escape");

    expect(currentInteraction(committed)).toEqual({ kind: "idle" });
    expect(labelLayout(committed, "shape-1")?.text).toBe("API");
  });

  test("clicking outside commits the typed text, and the click selects as usual", () => {
    const otherShape = drawRectangle(newEditor(), { x: 400, y: 100 }, { x: 500, y: 200 });
    const editing = typeLabel(drawWithLabelOpen(otherShape, "ellipse", { x: 100, y: 100 }, { x: 300, y: 200 }), "API");

    const clicked = click(editing, { x: 450, y: 150 });

    expect(currentInteraction(clicked)).toEqual({ kind: "idle" });
    expect(labelLayout(clicked, "shape-2")?.text).toBe("API");
    expect(selection(clicked)).toEqual(["shape-1"]);
  });

  test("Enter commits the typed text", () => {
    const editing = typeLabel(drawWithLabelOpen(newEditor(), "ellipse", { x: 100, y: 100 }, { x: 300, y: 200 }), "API");

    const committed = press(editing, "Enter");

    expect(currentInteraction(committed)).toEqual({ kind: "idle" });
    expect(labelLayout(committed, "shape-1")?.text).toBe("API");
  });

  test("cancelling puts back the text from before", () => {
    const named = drawLabelled(newEditor(), "ellipse", { x: 100, y: 100 }, { x: 300, y: 200 }, "API");
    const editing = typeLabel(press(named, "Enter"), "Gateway");
    expect(labelLayout(editing, "shape-1")?.text).toBe("Gateway");

    const cancelled = apply(editing, { type: "cancelLabel" });

    expect(currentInteraction(cancelled)).toEqual({ kind: "idle" });
    expect(labelLayout(cancelled, "shape-1")?.text).toBe("API");
  });

  test("Enter on the one selected Shape starts editing its Label", () => {
    const state = press(
      click(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 200 }), { x: 150, y: 150 }),
      "Enter",
    );

    expect(currentInteraction(state)).toEqual({ kind: "editingLabel", shapeId: "shape-1" });
  });

  test("Enter does nothing with several Shapes selected", () => {
    const two = drawRectangle(
      drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 200 }),
      { x: 300, y: 100 },
      { x: 400, y: 200 },
    );

    expect(currentInteraction(press(press(two, "a", { meta: true }), "Enter"))).toEqual({ kind: "idle" });
  });

  test("double-clicking a Shape selects it and starts editing its Label", () => {
    const two = drawRectangle(
      drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 200 }),
      { x: 300, y: 100 },
      { x: 400, y: 200 },
    );

    const state = doubleClick(two, { x: 150, y: 150 });

    expect(currentInteraction(state)).toEqual({ kind: "editingLabel", shapeId: "shape-1" });
    expect(selection(state)).toEqual(["shape-1"]);
  });

  test("double-clicking empty space edits nothing", () => {
    const state = doubleClick(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 200 }), { x: 500, y: 500 });

    expect(currentInteraction(state)).toEqual({ kind: "idle" });
  });
});

describe("undoing Label edits", () => {
  test("one editing session undoes as one step, however many changes were typed", () => {
    const drawn = drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 200 });
    const edited = press(typeLabel(typeLabel(typeLabel(press(drawn, "Enter"), "A"), "AP"), "API"), "Escape");

    const undone = apply(edited, undoInput);

    expect(labelLayout(undone, "shape-1")?.text).toBe("");
    expect(shapes(undone)).toHaveLength(1);
  });

  test("creating a Shape and typing its Label undo as one step", () => {
    const named = drawLabelled(newEditor(), "cylinder", { x: 100, y: 100 }, { x: 200, y: 200 }, "DB");

    const undone = apply(named, undoInput);

    expect(shapes(undone)).toEqual([]);
    expect(canUndo(undone)).toBe(false);
  });
});

describe("a text Shape whose Label is empty when editing ends", () => {
  const createText = (state: EditorState = newEditor()) =>
    drawWithLabelOpen(state, "text", { x: 100, y: 100 }, { x: 220, y: 140 });

  test.each([
    ["Escape", (state: EditorState) => press(state, "Escape")],
    ["Enter", (state: EditorState) => press(state, "Enter")],
    ["clicking outside", (state: EditorState) => click(state, { x: 500, y: 500 })],
    ["the commit input", (state: EditorState) => apply(state, { type: "commitLabel" })],
    ["cancelling", (state: EditorState) => apply(state, { type: "cancelLabel" })],
  ])("is removed by %s, and leaves nothing to undo after it was just created", (_, finish) => {
    const finished = finish(createText());

    expect(shapes(finished)).toEqual([]);
    expect(selection(finished)).toEqual([]);
    expect(canUndo(finished)).toBe(false);
  });

  test("is removed when only spaces and line breaks are left", () => {
    expect(shapes(press(typeLabel(createText(), " \n "), "Escape"))).toEqual([]);
  });

  test("is removed when its text is deleted, and undo brings it back with its text", () => {
    const named = press(typeLabel(createText(), "Title"), "Escape");
    const emptied = press(typeLabel(press(named, "Enter"), ""), "Escape");

    expect(shapes(emptied)).toEqual([]);
    expect(labelLayout(apply(emptied, undoInput), "shape-1")?.text).toBe("Title");
  });

  test("stays while its Label is being edited", () => {
    expect(shapes(createText())).toHaveLength(1);
  });

  test("other Symbols keep their Shape with an empty Label", () => {
    const state = press(drawWithLabelOpen(newEditor(), "rectangle", { x: 100, y: 100 }, { x: 200, y: 200 }), "Escape");

    expect(shapes(state)).toHaveLength(1);
  });
});

// With the fake measurer, a character at the medium font size is 10 wide, and a line is 25 high. The rectangle at
// (100,100)–(300,200) has its Label area inset by 8, at (108,108)–(292,192): 18 characters wide and 84 high.
function labelledRectangle(text: string, to: Point = { x: 300, y: 200 }): EditorState {
  return drawLabelled(newEditor(), "rectangle", { x: 100, y: 100 }, to, text);
}

function lineTexts(state: EditorState, id = "shape-1"): readonly string[] {
  return labelLayout(state, id)?.lines.map(({ text }) => text) ?? [];
}

describe("wrapping a Label", () => {
  test("wraps by words to fit the Label area", () => {
    expect(lineTexts(labelledRectangle("the quick brown fox jumps over the lazy dog"))).toEqual([
      "the quick brown",
      "fox jumps over the",
      "lazy dog",
    ]);
  });

  test("breaks a word longer than the line", () => {
    expect(lineTexts(labelledRectangle("abcdefghijklmnopqrstuvwxyz and more"))).toEqual([
      "abcdefghijklmnopqr",
      "stuvwxyz and more",
    ]);
  });

  test("may also break a word after a hyphen, as the browser does", () => {
    expect(lineTexts(labelledRectangle("client-server-architecture"))).toEqual(["client-server-", "architecture"]);
  });

  test("lets spaces hang at the end of a full line, as the browser does, rather than start a new line", () => {
    const state = labelledRectangle("abcdefghijklmnopqr  ");

    expect(lineTexts(state)).toEqual(["abcdefghijklmnopqr  "]);
    expect(shapes(state)[0]?.bounds.height).toBe(100);
  });

  test("never starts a line with the spaces between words, even when not one character fits a line", () => {
    // The Label area of a rectangle 15 wide has no width.
    expect(lineTexts(labelledRectangle("a  b", { x: 115, y: 200 }))).toEqual(["a ", "b"]);
  });

  test("places a line by its text, not by the spaces at its end", () => {
    const state = drawLabelled(newEditor(), "ellipse", { x: 100, y: 100 }, { x: 300, y: 200 }, "API ");

    expect(labelLayout(state, "shape-1")?.lines[0]?.bounds).toEqual({ x: 185, y: 137.5, width: 30, height: 25 });
  });

  test("keeps explicit line breaks, including empty lines", () => {
    expect(lineTexts(labelledRectangle("API\n\nGo, gRPC"))).toEqual(["API", "", "Go, gRPC"]);
  });

  test("an empty Label has no lines", () => {
    expect(lineTexts(labelledRectangle(""))).toEqual([]);
  });

  test("each line is placed in the Label area, from its top-left corner by default for a rectangle", () => {
    expect(labelLayout(labelledRectangle("the quick brown fox"), "shape-1")?.lines).toEqual([
      { text: "the quick brown", bounds: { x: 108, y: 108, width: 150, height: 25 } },
      { text: "fox", bounds: { x: 108, y: 133, width: 30, height: 25 } },
    ]);
  });

  test("an ellipse's Label is centred in its Label area", () => {
    // The ellipse's Label area is centred on (200,150).
    const state = drawLabelled(newEditor(), "ellipse", { x: 100, y: 100 }, { x: 300, y: 200 }, "API\nGateway");

    expect(labelLayout(state, "shape-1")?.lines).toEqual([
      { text: "API", bounds: { x: 185, y: 125, width: 30, height: 25 } },
      { text: "Gateway", bounds: { x: 165, y: 150, width: 70, height: 25 } },
    ]);
  });
});

describe("growing to fit a Label", () => {
  test("a Shape grows taller when its Label needs more room than its Label area has", () => {
    // Five lines of 25 need 125, and the Label area is 16 less than the Shape's height.
    const state = labelledRectangle("1\n2\n3\n4\n5");

    expect(shapes(state)).toEqual([
      { id: "shape-1", symbol: "rectangle", bounds: { x: 100, y: 100, width: 200, height: 141 } },
    ]);
    expect(labelLayout(state, "shape-1")?.area).toEqual({ x: 108, y: 108, width: 184, height: 125 });
  });

  test("a Shape returns to its own size when its Label gets shorter again", () => {
    const shortened = press(typeLabel(press(labelledRectangle("1\n2\n3\n4\n5"), "Enter"), "1\n2"), "Escape");

    expect(shapes(shortened)[0]?.bounds).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  test("grows while the Label is being typed", () => {
    const typing = typeLabel(
      drawWithLabelOpen(newEditor(), "rectangle", { x: 100, y: 100 }, { x: 300, y: 200 }),
      "1\n2\n3\n4\n5",
    );

    expect(shapes(typing)[0]?.bounds.height).toBe(141);
  });

  test("an empty Label doesn't grow even the smallest Shape", () => {
    const state = labelledRectangle("", { x: 110, y: 110 });

    expect(shapes(state)[0]?.bounds).toEqual({ x: 100, y: 100, width: 10, height: 10 });
  });

  test("the Label of a cylinder sits in its body, below the lid and above the bottom curve, also when it grows", () => {
    // The lid is 30 high, and the bottom curve takes 15 off the body.
    const cylinder = (text: string) =>
      drawLabelled(newEditor(), "cylinder", { x: 100, y: 100 }, { x: 200, y: 220 }, text);

    for (const state of [cylinder("DB"), cylinder("1\n2\n3\n4\n5\n6")]) {
      const height = shapes(state)[0]?.bounds.height ?? 0;
      const lines = labelLayout(state, "shape-1")?.lines ?? [];
      expect(lines.length).toBeGreaterThan(0);
      for (const { bounds } of lines) {
        expect(bounds.y).toBeGreaterThanOrEqual(130);
        expect(bounds.y + bounds.height).toBeLessThanOrEqual(100 + height - 15);
      }
    }
    expect(shapes(cylinder("1\n2\n3\n4\n5\n6"))[0]?.bounds.height).toBeGreaterThan(120);
  });
});

describe("a Shape grown to fit its Label", () => {
  // Displayed at (100,100)–(300,241), though its own height is 100.
  const grown = () => press(labelledRectangle("1\n2\n3\n4\n5"), "Escape");

  test("is selected by a click on its grown part", () => {
    expect(selection(click(grown(), { x: 200, y: 230 }))).toEqual(["shape-1"]);
  });

  test("is selected by a marquee only when the marquee covers its grown part too", () => {
    expect(selection(drag(grown(), { x: 90, y: 90 }, { x: 310, y: 220 }))).toEqual([]);
    expect(selection(drag(grown(), { x: 90, y: 90 }, { x: 310, y: 250 }))).toEqual(["shape-1"]);
  });

  test("has its resize handles around its grown Bounds", () => {
    const handles = resizeHandles(click(grown(), { x: 200, y: 150 }));

    expect(handles.find(({ handle }) => handle === "se")?.position).toEqual({ x: 300, y: 241 });
  });

  test("resized from its bottom, keeps the height it was dragged to", () => {
    const resized = drag(click(grown(), { x: 200, y: 150 }), { x: 200, y: 241 }, { x: 200, y: 261 });

    expect(shapes(resized)[0]?.bounds).toEqual({ x: 100, y: 100, width: 200, height: 161 });
  });

  test("resized from its bottom without becoming taller than its Label needs, keeps its own height", () => {
    const resized = drag(click(grown(), { x: 200, y: 150 }), { x: 200, y: 241 }, { x: 200, y: 236 });
    const shortened = press(typeLabel(press(resized, "Enter"), "1"), "Escape");

    expect(shapes(resized)[0]?.bounds).toEqual({ x: 100, y: 100, width: 200, height: 141 });
    expect(shapes(shortened)[0]?.bounds).toEqual({ x: 100, y: 100, width: 200, height: 100 });
  });

  test("resized from its top without becoming taller than its Label needs, keeps its bottom where it was", () => {
    const resized = drag(click(grown(), { x: 200, y: 150 }), { x: 200, y: 100 }, { x: 200, y: 120 });

    expect(shapes(resized)[0]?.bounds).toEqual({ x: 100, y: 100, width: 200, height: 141 });
  });

  test("flipped upwards past its top without becoming taller than its Label needs, grows up from its old top", () => {
    const resized = drag(click(grown(), { x: 200, y: 150 }), { x: 200, y: 241 }, { x: 200, y: 0 });

    expect(shapes(resized)[0]?.bounds).toEqual({ x: 100, y: -41, width: 200, height: 141 });
  });

  test("resized from its top to become taller, grows upwards", () => {
    const resized = drag(click(grown(), { x: 200, y: 150 }), { x: 200, y: 100 }, { x: 200, y: 80 });

    expect(shapes(resized)[0]?.bounds).toEqual({ x: 100, y: 80, width: 200, height: 161 });
  });

  test("resized from its side, keeps its own height, so it still shrinks back when its Label gets shorter", () => {
    const resized = drag(click(grown(), { x: 200, y: 150 }), { x: 300, y: 170.5 }, { x: 350, y: 170.5 });
    const shortened = press(typeLabel(press(resized, "Enter"), "1"), "Escape");

    expect(shapes(resized)[0]?.bounds).toEqual({ x: 100, y: 100, width: 250, height: 141 });
    expect(shapes(shortened)[0]?.bounds).toEqual({ x: 100, y: 100, width: 250, height: 100 });
  });
});

describe("alignment and font size", () => {
  test.each([
    ["rectangle", "topLeft"],
    ["roundedRectangle", "topLeft"],
    ["cloud", "topLeft"],
    ["ellipse", "center"],
    ["cylinder", "center"],
    ["text", "center"],
  ] as const)("a new %s's Label is aligned %s", (symbol, alignment) => {
    const created = drawWithLabelOpen(newEditor(), symbol, { x: 100, y: 100 }, { x: 300, y: 200 });

    expect(labelLayout(created, "shape-1")?.alignment).toBe(alignment);
  });

  test("centring a Label centres its lines in the Label area", () => {
    const centred = apply(click(labelledRectangle("the quick brown fox"), { x: 200, y: 150 }), {
      type: "changeLabelAlignment",
      alignment: "center",
    });

    expect(labelLayout(centred, "shape-1")).toMatchObject({
      alignment: "center",
      lines: [
        { text: "the quick brown", bounds: { x: 125, y: 125, width: 150, height: 25 } },
        { text: "fox", bounds: { x: 185, y: 150, width: 30, height: 25 } },
      ],
    });
  });

  test("a larger font size wraps and grows the Shape for the larger text", () => {
    // At the large font size, a character is 14 wide and a line 35 high, so 13 characters fit a line.
    const large = apply(click(labelledRectangle("the quick brown fox jumps over"), { x: 200, y: 150 }), {
      type: "changeStyle",
      style: { fontSize: "large" },
    });

    expect(labelLayout(large, "shape-1")).toMatchObject({
      fontSize: "large",
      fontPixels: 28,
      lineHeight: 35,
      lines: [{ text: "the quick" }, { text: "brown fox" }, { text: "jumps over" }],
    });
    expect(shapes(large)[0]?.bounds.height).toBe(121);
  });

  test("a smaller font size fits more on a line", () => {
    // At the small font size, a character is 7 wide, so 26 characters fit a line.
    const small = apply(click(labelledRectangle("the quick brown fox jumps over"), { x: 200, y: 150 }), {
      type: "changeStyle",
      style: { fontSize: "small" },
    });

    expect(lineTexts(small)).toEqual(["the quick brown fox jumps", "over"]);
  });

  test("applies to every selected Shape, and undoes as one step", () => {
    const two = drawRectangle(labelledRectangle("A"), { x: 400, y: 100 }, { x: 500, y: 200 });
    const changed = apply(
      press(two, "a", { meta: true }),
      { type: "changeStyle", style: { fontSize: "small" } },
      { type: "changeLabelAlignment", alignment: "center" },
    );

    for (const id of ["shape-1", "shape-2"]) {
      expect(labelLayout(changed, id)).toMatchObject({ fontSize: "small", alignment: "center" });
    }
    expect(labelLayout(apply(changed, undoInput), "shape-1")).toMatchObject({
      fontSize: "small",
      alignment: "topLeft",
    });
    expect(labelLayout(apply(changed, undoInput, undoInput), "shape-2")).toMatchObject({ fontSize: "medium" });
  });

  test("applies to the Label being edited, as part of its editing session", () => {
    const editing = typeLabel(drawWithLabelOpen(newEditor(), "ellipse", { x: 100, y: 100 }, { x: 300, y: 200 }), "API");

    const committed = press(apply(editing, { type: "changeStyle", style: { fontSize: "large" } }), "Escape");

    expect(labelLayout(committed, "shape-1")?.fontSize).toBe("large");
    expect(shapes(apply(committed, undoInput))).toEqual([]);
  });
});
