import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { exportSvg } from "./export";
import { fixedWidthTextMeasurer } from "./fakes";
import { labelFontFamily } from "./label";
import { rendering, sketch } from "./queries";
import { svgText } from "./svg";
import type { Style } from "./style";
import { symbolIds, type SymbolId } from "./symbols";
import {
  apply,
  click,
  drag,
  drawLabelled,
  drawRectangle,
  drawSymbol,
  newEditor,
  pointerDown,
  pointerMove,
  press,
  selectTool,
  drawWithLabelOpen,
  twoRectangles,
  typeLabel,
} from "./test-helpers";

type Element = {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly Element[];
  // The element's own text content, with entities left as they are.
  readonly text: string;
};

// The elements of SVG text as a tree, enough to check its structure and text.
function parse(svg: string): Element {
  const tags = svg.matchAll(/<(\/?)([\w-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>([^<]*)/g);
  type Open = {
    readonly tag: string;
    readonly attributes: Record<string, string>;
    readonly children: Element[];
    text: string;
  };
  const root: Open = { tag: "", attributes: {}, children: [], text: "" };
  const open: Open[] = [root];
  for (const [, closing, tag = "", attributeText = "", selfClosing, after = ""] of tags) {
    if (closing) {
      open.pop();
      const parent = open.at(-1);
      if (parent) parent.text += after;
      continue;
    }
    const attributes = Object.fromEntries(
      [...attributeText.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name = "", value = ""]) => [name, value]),
    );
    const element: Open = { tag, attributes, children: [], text: selfClosing ? "" : after };
    open.at(-1)?.children.push(element);
    if (selfClosing) {
      const parent = open.at(-1);
      if (parent) parent.text += after;
    } else open.push(element);
  }
  const [svgElement] = root.children;
  if (!svgElement || root.children.length !== 1) throw new Error(`expected one root element in ${svg}`);
  return svgElement;
}

function exported(state: EditorState): Element {
  const svg = exportSvg(sketch(state), fixedWidthTextMeasurer);
  if (svg === undefined) throw new Error("the Sketch exported nothing");
  return parse(svg);
}

function renderedOnScreen(state: EditorState): Element {
  return parse(svgText(rendering(state)));
}

function textElements(element: Element): readonly Element[] {
  return descendants(element).filter(({ tag }) => tag === "text");
}

// A text Shape at (100,100)–(220,140), with its Label being edited.
function editingText(text = ""): EditorState {
  return typeLabel(drawWithLabelOpen(newEditor(), "text", { x: 100, y: 100 }, { x: 220, y: 140 }), text);
}

function textShape(): EditorState {
  return press(editingText("Title"), "Escape");
}

// A Shape of `symbol` at (100,100)–(300,200) with the Label `text`, in `style`, and nothing selected.
function labelled(symbol: SymbolId, text: string, style: Partial<Style> = {}): EditorState {
  const chosen = apply(newEditor(), { type: "changeStyle", style });
  return press(drawLabelled(chosen, symbol, { x: 100, y: 100 }, { x: 300, y: 200 }, text), "Escape");
}

// A rectangle, its Label area inset by 8 at (108,108)–(292,192), with a Label of two lines.
function labelledRectangle(): EditorState {
  return labelled("rectangle", "the quick brown fox");
}

function strokedElements(element: Element): readonly Element[] {
  return descendants(element).filter(({ attributes }) => (attributes.stroke ?? "none") !== "none");
}

function descendants(element: Element): readonly Element[] {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

function shapeElements(svg: Element): readonly Element[] {
  return descendants(svg).filter(({ attributes }) => attributes["data-shape"] !== undefined);
}

describe("SVG export", () => {
  test("an empty Sketch exports nothing", () => {
    expect(exportSvg(sketch(newEditor()), fixedWidthTextMeasurer)).toBeUndefined();
  });

  test("has one element per Shape, with its Symbol", () => {
    const state = drawSymbol(twoRectangles(), "ellipse", { x: 100, y: 300 }, { x: 220, y: 380 });

    expect(shapeElements(exported(state)).map(({ attributes }) => attributes)).toEqual([
      expect.objectContaining({ "data-shape": "shape-1", "data-symbol": "rectangle" }),
      expect.objectContaining({ "data-shape": "shape-2", "data-symbol": "rectangle" }),
      expect.objectContaining({ "data-shape": "shape-3", "data-symbol": "ellipse" }),
    ]);
  });

  test("draws each Shape with paths at its place on the Sketch", () => {
    const [rectangle] = shapeElements(exported(drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 })));

    expect(rectangle?.children.map(({ tag, attributes }) => [tag, attributes.d])).toContainEqual([
      "path",
      "M 100 100 L 200 100 L 200 180 L 100 180 Z",
    ]);
  });

  test("is cropped to the content bounds plus a margin of 20", () => {
    // The Shapes span (100,100)–(400,180).
    const { tag, attributes } = exported(twoRectangles());

    expect(tag).toBe("svg");
    expect(attributes).toMatchObject({
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "80 80 340 120",
      width: "340",
      height: "120",
    });
  });

  test("follows the Shapes after they move", () => {
    // Moves shape-1 from (100,100)–(200,180) up and left, to (40,60)–(140,140).
    const state = drag(twoRectangles(), { x: 150, y: 140 }, { x: 90, y: 100 });

    expect(exported(state).attributes).toMatchObject({ viewBox: "20 40 400 160", width: "400", height: "160" });
  });

  test("leaves out the selection, resize handles and grid, so everything drawn belongs to a Shape", () => {
    const allSelected = press(twoRectangles(), "a", { meta: true });
    const oneSelected = twoRectangles();

    for (const state of [allSelected, oneSelected]) {
      const svg = exported(state);
      const shapeGroups = shapeElements(svg);
      expect(svg.children).toHaveLength(1);
      expect(svg.children[0]?.children).toEqual(shapeGroups);
    }
  });

  test("draws each line of a Label as text in the Label font, where the line is laid out", () => {
    const [rectangle] = shapeElements(exported(labelledRectangle()));

    expect(textElements(rectangle!).map(({ attributes, text }) => ({ attributes, text }))).toEqual([
      {
        text: "the quick brown",
        attributes: expect.objectContaining({
          x: "108",
          y: "120.5",
          "font-size": "20",
          "font-family": labelFontFamily,
        }),
      },
      { text: "fox", attributes: expect.objectContaining({ x: "108", y: "145.5" }) },
    ]);
  });

  test("draws a right-aligned Label from the end of each line", () => {
    const state = apply(click(labelledRectangle(), { x: 200, y: 150 }), {
      type: "changeLabelAlignment",
      alignment: { horizontal: "right" },
    });

    expect(textElements(exported(state)).map(({ attributes }) => attributes)).toEqual([
      expect.objectContaining({ x: "292", "text-anchor": "end" }),
      expect.objectContaining({ x: "292", "text-anchor": "end" }),
    ]);
  });

  test("draws a centred Label from the middle of each line", () => {
    const [text] = shapeElements(exported(textShape()));

    expect(textElements(text!).map(({ attributes }) => attributes)).toEqual([
      expect.objectContaining({ x: "160", y: "120", "text-anchor": "middle" }),
    ]);
  });

  test("escapes the text of a Label", () => {
    const state = labelled("ellipse", "A <b> & C");

    expect(textElements(exported(state)).map(({ text }) => text)).toEqual(["A &lt;b&gt; &amp; C"]);
  });

  test("keeps the spaces in a line, as they were measured, but not those hanging at its end", () => {
    const [line] = textElements(exported(labelled("rectangle", "  a  b  ")));

    expect(line?.text).toBe("  a  b");
    expect(line?.attributes["xml:space"]).toBe("preserve");
  });

  test("draws no text for an empty Label", () => {
    expect(textElements(exported(twoRectangles()))).toEqual([]);
  });

  test("draws no text for a blank line, though it takes up its room", () => {
    const state = labelled("rectangle", "API\n\nGo");

    expect(textElements(exported(state)).map(({ attributes, text }) => [text, attributes.y])).toEqual([
      ["API", "120.5"],
      ["Go", "170.5"],
    ]);
  });

  test("is cropped to a Shape grown to fit its Label", () => {
    const grown = labelled("rectangle", "1\n2\n3\n4\n5");

    expect(exported(grown).attributes).toMatchObject({ viewBox: "80 80 240 181" });
  });

  test("leaves out the placeholder outline of a text Shape, which has no lines of its own", () => {
    const [text] = shapeElements(exported(textShape()));

    expect(text?.attributes["data-symbol"]).toBe("text");
    expect(strokedElements(text!)).toEqual([]);
  });

  test("styles each Shape inline, so the file needs no stylesheet", () => {
    const svg = exported(twoRectangles());
    const elements = [svg, ...descendants(svg)];

    expect(elements.filter(({ tag }) => tag === "style")).toEqual([]);
    expect(elements.filter(({ attributes }) => attributes.class !== undefined)).toEqual([]);
    for (const shape of shapeElements(svg)) {
      expect(descendants(shape)).toContainEqual(
        expect.objectContaining({ attributes: expect.objectContaining({ stroke: expect.stringMatching(/^#/) }) }),
      );
    }
  });
});

// A Shape of `symbol` at (100,100)–(300,200) in `style`, with the Label "API", and nothing selected.
function styled(style: Partial<Style>, symbol: SymbolId = "rectangle"): EditorState {
  return labelled(symbol, "API", style);
}

// The one Shape of the export, its outline (drawn first, as the fill), the pieces of its lines and its Label.
function styledParts(state: EditorState) {
  const [shape] = shapeElements(exported(state));
  if (!shape) throw new Error("the Sketch exported no Shape");
  const [outline] = shape.children;
  return { outline: outline?.attributes ?? {}, lines: strokedElements(shape), text: textElements(shape) };
}

function dashes(element: Element): readonly number[] {
  return (element.attributes["stroke-dasharray"] ?? "").split(" ").filter(Boolean).map(Number);
}

describe("styles in the SVG export", () => {
  test("draws a Shape's lines and its Label in its stroke colour", () => {
    const black = styledParts(styled({}));
    const red = styledParts(styled({ strokeColor: "red" }));

    const colours = (parts: ReturnType<typeof styledParts>) => [
      ...parts.lines.map(({ attributes }) => attributes.stroke),
      ...parts.text.map(({ attributes }) => attributes.fill),
    ];
    expect(new Set(colours(red)).size).toBe(1);
    expect(colours(red)[0]).toMatch(/^#/);
    expect(colours(red)[0]).not.toBe(colours(black)[0]);
  });

  test("fills the outline with the fill colour, and a transparent one with nothing", () => {
    expect(styledParts(styled({})).outline.fill).toBe("none");
    expect(styledParts(styled({ fill: "blue" })).outline.fill).toMatch(/^#/);
    expect(styledParts(styled({ fill: "blue" })).outline.stroke ?? "none").toBe("none");
  });

  test("fills a Shape lighter than its lines in the same colour, so its Label stays readable", () => {
    const { outline, lines } = styledParts(styled({ strokeColor: "blue", fill: "blue" }));

    expect(outline.fill).not.toBe(lines[0]?.attributes.stroke);
  });

  test("draws thick lines wider than thin ones", () => {
    const width = (style: Partial<Style>) => Number(styledParts(styled(style)).lines[0]?.attributes["stroke-width"]);

    expect(width({ strokeWidth: "thick" })).toBeGreaterThan(width({ strokeWidth: "thin" }));
  });

  test("draws solid lines without dashes", () => {
    for (const line of styledParts(styled({ strokeWidth: "thick" })).lines) {
      expect(line.attributes["stroke-dasharray"]).toBeUndefined();
    }
  });

  test.each(["dashed", "dotted"] as const)(
    "draws every piece of every Symbol's lines %s",
    (strokePattern) => {
      for (const symbol of symbolIds.filter((id) => id !== "text")) {
        const { lines } = styledParts(styled({ strokePattern }, symbol));
        expect(lines.length).toBeGreaterThan(0);
        for (const line of lines) expect(dashes(line)).toHaveLength(2);
      }
    },
  );

  test("draws dots as round dots, and dashes and dots with round ends", () => {
    const [dotted] = styledParts(styled({ strokePattern: "dotted" })).lines;
    const [dashed] = styledParts(styled({ strokePattern: "dashed" })).lines;

    expect(dashes(dotted!)[0]).toBe(0);
    expect(dashes(dashed!)[0]).toBeGreaterThan(0);
    expect(dotted?.attributes["stroke-linecap"]).toBe("round");
    expect(dashed?.attributes["stroke-linecap"]).toBe("round");
  });

  test.each(["dashed", "dotted"] as const)(
    "fits a whole number of %s steps around a closed outline, so no step is cut short where it closes",
    (strokePattern) => {
      // The rectangle is 200 by 100, so its outline is 600 long.
      const [line] = styledParts(styled({ strokePattern })).lines;
      const [dash = 0, gap = 0] = dashes(line!);

      const steps = 600 / (dash + gap);

      expect(steps).toBeCloseTo(Math.round(steps), 6);
    },
  );

  test("spaces the dashes of thick lines further apart than those of thin ones", () => {
    const step = (style: Partial<Style>) => {
      const [dash = 0, gap = 0] = dashes(styledParts(styled(style)).lines[0]!);
      return dash + gap;
    };

    expect(step({ strokePattern: "dashed", strokeWidth: "thick" })).toBeGreaterThan(
      step({ strokePattern: "dashed", strokeWidth: "thin" }),
    );
    expect(step({ strokePattern: "dotted", strokeWidth: "thick" })).toBeGreaterThan(
      step({ strokePattern: "dotted", strokeWidth: "thin" }),
    );
  });

  test("draws the lid of a cylinder as a piece of its own, so each piece fits its own dashes", () => {
    const { lines } = styledParts(styled({ strokePattern: "dashed" }, "cylinder"));

    expect(lines).toHaveLength(2);
    expect(lines.map(({ attributes }) => attributes.d?.match(/M/g))).toEqual([["M"], ["M"]]);
  });
});

describe("the rendering on screen", () => {
  test("draws the Shape being drawn in the style it will have", () => {
    const blue = apply(newEditor(), { type: "changeStyle", style: { strokeColor: "blue", fill: "yellow" } });
    const drawing = apply(
      blue,
      selectTool("ellipse"),
      pointerDown({ x: 100, y: 100 }),
      pointerMove({ x: 220, y: 180 }),
    );

    const [beingDrawn] = renderedOnScreen(drawing).children;
    const [drawn] = renderedOnScreen(drawSymbol(blue, "ellipse", { x: 100, y: 100 }, { x: 220, y: 180 })).children;

    expect(beingDrawn?.children).toEqual(drawn?.children);
  });

  test("renders the Shapes just as the export does", () => {
    const state = drawSymbol(twoRectangles(), "cloud", { x: 100, y: 300 }, { x: 260, y: 400 });

    expect(renderedOnScreen(state)).toEqual(exported(state).children[0]);
  });

  test("includes a Shape while it is being drawn", () => {
    const state = apply(
      twoRectangles(),
      selectTool("ellipse"),
      pointerDown({ x: 100, y: 300 }),
      pointerMove({ x: 220, y: 380 }),
    );

    expect(renderedOnScreen(state).children.map(({ attributes }) => attributes["data-symbol"])).toEqual([
      "rectangle",
      "rectangle",
      "ellipse",
    ]);
  });

  test("renders Labels just as the export does", () => {
    expect(renderedOnScreen(labelledRectangle())).toEqual(exported(labelledRectangle()).children[0]);
  });

  test("leaves out the Label being edited, as its text field shows it instead", () => {
    const editing = press(click(labelledRectangle(), { x: 200, y: 150 }), "Enter");

    expect(textElements(renderedOnScreen(editing))).toEqual([]);
  });

  test("shows a placeholder outline for a text Shape while it shows no Label, so it can still be found", () => {
    const [empty] = shapeElements(renderedOnScreen(editingText()));
    const [typed] = shapeElements(renderedOnScreen(editingText("Title")));

    expect(strokedElements(empty!)).toHaveLength(1);
    expect(strokedElements(typed!)).toHaveLength(1);
  });

  test("shows no placeholder outline for a text Shape with a Label", () => {
    const [text] = shapeElements(renderedOnScreen(textShape()));

    expect(strokedElements(text!)).toEqual([]);
  });
});
