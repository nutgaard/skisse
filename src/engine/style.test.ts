import { describe, expect, test } from "vitest";
import { canUndo, selection, selectionStyle, shapeStyle, shapes } from "./queries";
import type { Style } from "./style";
import {
  apply,
  click,
  drag,
  drawRectangle,
  drawSymbol,
  newEditor,
  press,
  twoRectangles,
  undoInput,
} from "./test-helpers";

function changeStyle(style: Partial<Style>) {
  return { type: "changeStyle", style } as const;
}

// A rectangle at (100,100)–(200,180), selected.
function rectangle() {
  return drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 200, y: 180 });
}

// A value of each style property other than the default.
const changes: readonly Partial<Style>[] = [
  { strokeColor: "red" },
  { fill: "blue" },
  { strokePattern: "dashed" },
  { strokePattern: "dotted" },
  { strokeWidth: "thick" },
  { fontSize: "large" },
];

describe("styling Shapes", () => {
  test.each(changes)("changes %o of the selected Shape, and keeps the rest of its style", (change) => {
    const changed = apply(rectangle(), changeStyle(change));

    expect(shapeStyle(changed, "shape-1")).toEqual({ ...shapeStyle(rectangle(), "shape-1"), ...change });
  });

  test.each(changes)("changes %o of every selected Shape", (change) => {
    const changed = apply(press(twoRectangles(), "a", { meta: true }), changeStyle(change));

    expect(shapeStyle(changed, "shape-1")).toMatchObject(change);
    expect(shapeStyle(changed, "shape-2")).toMatchObject(change);
  });

  test("leaves the Shapes that are not selected as they are", () => {
    const changed = apply(twoRectangles(), changeStyle({ strokeColor: "green" }));

    expect(shapeStyle(changed, "shape-1")?.strokeColor).toBe("black");
    expect(shapeStyle(changed, "shape-2")?.strokeColor).toBe("green");
  });

  test("a change to several Shapes undoes as one step", () => {
    const changed = apply(
      press(twoRectangles(), "a", { meta: true }),
      changeStyle({ fill: "yellow", strokeWidth: "thick" }),
    );

    const undone = apply(changed, undoInput);

    expect(shapeStyle(undone, "shape-1")).toEqual(shapeStyle(twoRectangles(), "shape-1"));
    expect(shapeStyle(undone, "shape-2")).toEqual(shapeStyle(twoRectangles(), "shape-2"));
    // The step before it drew shape-2.
    expect(shapes(apply(undone, undoInput)).map(({ id }) => id)).toEqual(["shape-1"]);
  });

  test("the first Shape has a transparent fill", () => {
    expect(shapeStyle(rectangle(), "shape-1")?.fill).toBe("transparent");
  });

  test("a new Shape takes the style most recently chosen for another Shape", () => {
    const chosen = apply(rectangle(), changeStyle({ strokeColor: "red" }), changeStyle({ strokePattern: "dotted" }));

    const drawn = drawRectangle(chosen, { x: 300, y: 100 }, { x: 400, y: 180 });

    expect(shapeStyle(drawn, "shape-2")).toEqual({
      ...shapeStyle(rectangle(), "shape-1"),
      strokeColor: "red",
      strokePattern: "dotted",
    });
  });

  test("a style chosen with nothing selected is the style of the next new Shape, and changes no Shape", () => {
    const chosen = apply(press(rectangle(), "Escape"), changeStyle({ fill: "green" }));

    const drawn = drawRectangle(chosen, { x: 300, y: 100 }, { x: 400, y: 180 });

    expect(shapeStyle(chosen, "shape-1")?.fill).toBe("transparent");
    expect(shapeStyle(drawn, "shape-2")?.fill).toBe("green");
    expect(canUndo(apply(chosen, undoInput))).toBe(false);
  });


  test("takes only colours of the palette, leaving out any other, such as one typed in", () => {
    const changed = apply(
      rectangle(),
      changeStyle({ strokeColor: "#ff00ff", fill: "magenta", strokeWidth: "thick" } as unknown as Partial<Style>),
    );

    expect(shapeStyle(changed, "shape-1")).toMatchObject({
      strokeColor: "black",
      fill: "transparent",
      strokeWidth: "thick",
    });
  });

  test("takes only the stroke patterns, stroke widths and font sizes there are", () => {
    const changed = apply(
      rectangle(),
      changeStyle({ strokePattern: "wavy", strokeWidth: 7, fontSize: "huge" } as unknown as Partial<Style>),
    );

    expect(shapeStyle(changed, "shape-1")).toEqual(shapeStyle(rectangle(), "shape-1"));
  });

  test("a colour not in the palette does not become the style of new Shapes", () => {
    const chosen = apply(press(rectangle(), "Escape"), changeStyle({ fill: "#ff00ff" } as unknown as Partial<Style>));

    const drawn = drawRectangle(chosen, { x: 300, y: 100 }, { x: 400, y: 180 });

    expect(shapeStyle(drawn, "shape-2")?.fill).toBe("transparent");
  });

  test.each(["rectangle", "cylinder", "cloud", "person"] as const)(
    "a click inside a %s with a transparent fill, away from its lines, selects it",
    (symbol) => {
      const drawn = press(drawSymbol(newEditor(), symbol, { x: 100, y: 100 }, { x: 300, y: 300 }), "Escape");

      const clicked = click(drawn, { x: 200, y: 230 });

      expect(shapeStyle(clicked, "shape-1")?.fill).toBe("transparent");
      expect(selection(clicked)).toEqual(["shape-1"]);
    },
  );

  test("a Shape with a transparent fill can be dragged from inside", () => {
    const dragged = drag(press(rectangle(), "Escape"), { x: 150, y: 140 }, { x: 250, y: 240 });

    expect(shapes(dragged)[0]?.bounds).toEqual({ x: 200, y: 200, width: 100, height: 80 });
  });
});


describe("the style shown for the selection", () => {
  test("is the selected Shape's style", () => {
    const changed = apply(rectangle(), changeStyle({ fill: "red" }));

    expect(selectionStyle(changed)).toEqual(shapeStyle(changed, "shape-1"));
  });

  test("is mixed in each property the selected Shapes differ in", () => {
    const differing = apply(twoRectangles(), changeStyle({ fill: "red", strokeWidth: "thick" }));

    const both = press(differing, "a", { meta: true });

    expect(selectionStyle(both)).toEqual({
      strokeColor: "black",
      fill: "mixed",
      strokePattern: "solid",
      strokeWidth: "mixed",
      fontSize: "medium",
    });
  });

  test("with nothing selected, is the style new Shapes get", () => {
    const nothingSelected = press(apply(rectangle(), changeStyle({ strokePattern: "dashed" })), "Escape");

    expect(selectionStyle(newEditor())).toEqual(shapeStyle(rectangle(), "shape-1"));
    expect(selectionStyle(nothingSelected)).toMatchObject({ strokePattern: "dashed" });
  });
});
