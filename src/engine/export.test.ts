import { describe, expect, test } from "vitest";
import type { EditorState } from "./editor";
import { exportSvg } from "./export";
import { rendering, sketch } from "./queries";
import { svgText } from "./svg";
import {
  apply,
  drag,
  drawRectangle,
  drawSymbol,
  newEditor,
  pointerDown,
  pointerMove,
  press,
  selectTool,
  twoRectangles,
} from "./test-helpers";

type Element = {
  readonly tag: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly children: readonly Element[];
};

// The elements of SVG text as a tree, enough to check its structure. Text content is left out.
function parse(svg: string): Element {
  const tags = svg.matchAll(/<(\/?)([\w-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g);
  type Open = { readonly tag: string; readonly attributes: Record<string, string>; readonly children: Element[] };
  const root: Open = { tag: "", attributes: {}, children: [] };
  const open: Open[] = [root];
  for (const [, closing, tag = "", attributeText = "", selfClosing] of tags) {
    if (closing) {
      open.pop();
      continue;
    }
    const attributes = Object.fromEntries(
      [...attributeText.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name = "", value = ""]) => [name, value]),
    );
    const element: Open = { tag, attributes, children: [] };
    open.at(-1)?.children.push(element);
    if (!selfClosing) open.push(element);
  }
  const [svgElement] = root.children;
  if (!svgElement || root.children.length !== 1) throw new Error(`expected one root element in ${svg}`);
  return svgElement;
}

function exported(state: EditorState): Element {
  const svg = exportSvg(sketch(state));
  if (svg === undefined) throw new Error("the Sketch exported nothing");
  return parse(svg);
}

function renderedOnScreen(state: EditorState): Element {
  return parse(svgText(rendering(state)));
}

function textShape(): EditorState {
  return drawSymbol(newEditor(), "text", { x: 100, y: 100 }, { x: 220, y: 140 });
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
    expect(exportSvg(sketch(newEditor()))).toBeUndefined();
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

describe("the rendering on screen", () => {
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

  test("shows a placeholder outline for a text Shape, so it can still be found", () => {
    const [text] = shapeElements(renderedOnScreen(textShape()));

    expect(strokedElements(text!)).toHaveLength(1);
  });
});
