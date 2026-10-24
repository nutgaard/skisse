import { describe, expect, test } from "vitest";
import type { EditorState, ShapeId } from "./editor";
import type { Point } from "./geometry";
import { arrows, rendering, selection, shapeTree, type ShapeTree } from "./queries";
import { svgText } from "./svg";
import {
  boundsById,
  click,
  drag,
  drawArrow,
  drawRectangle,
  drawSymbol,
  drawWithLabelOpen,
  newEditor,
  press,
} from "./test-helpers";

// A Shape in the Shape tree, with the Shapes directly inside it.
function shape(id: ShapeId, ...children: readonly ShapeTree[]): ShapeTree {
  return { id, children };
}

function undo(state: EditorState): EditorState {
  return press(state, "z", { meta: true });
}

function redo(state: EditorState): EditorState {
  return press(state, "z", { meta: true, shift: true });
}

// shape-1 is a Container at (100,100)–(500,400), and shape-2 a rectangle outside it at (600,100)–(700,180).
function containerAndShape(): EditorState {
  return drawRectangle(
    drawRectangle(newEditor(), { x: 100, y: 100 }, { x: 500, y: 400 }),
    { x: 600, y: 100 },
    { x: 700, y: 180 },
  );
}

describe("dropping a Shape on a Container", () => {
  test("a Shape dropped with its centre inside a Container becomes its child", () => {
    const state = drag(containerAndShape(), { x: 650, y: 140 }, { x: 300, y: 250 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2"))]);
  });

  test("a child dragged out of its Container becomes a top-level Shape again", () => {
    const inside = drag(containerAndShape(), { x: 650, y: 140 }, { x: 300, y: 250 });

    const state = drag(inside, { x: 300, y: 250 }, { x: 700, y: 250 });

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-2")]);
  });

  test("a Shape dropped with its centre just outside a Container stays at the top level", () => {
    const state = drag(containerAndShape(), { x: 650, y: 140 }, { x: 560, y: 250 });

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-2")]);
  });

  test("a Shape dropped on a cylinder is not nested in it", () => {
    const withCylinder = drawSymbol(containerAndShape(), "cylinder", { x: 100, y: 500 }, { x: 500, y: 800 });

    const state = drag(withCylinder, { x: 650, y: 140 }, { x: 300, y: 650 });

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-2"), shape("shape-3")]);
  });

  test("a Shape dropped on a cloud or a rounded rectangle becomes its child", () => {
    const withCloud = drawSymbol(containerAndShape(), "cloud", { x: 100, y: 500 }, { x: 500, y: 800 });
    const withBoth = drawSymbol(withCloud, "roundedRectangle", { x: 800, y: 100 }, { x: 1200, y: 400 });

    const inCloud = drag(withBoth, { x: 650, y: 140 }, { x: 300, y: 650 });
    const inRounded = drag(inCloud, { x: 300, y: 650 }, { x: 1000, y: 250 });

    expect(shapeTree(inCloud)).toEqual([shape("shape-1"), shape("shape-3", shape("shape-2")), shape("shape-4")]);
    expect(shapeTree(inRounded)).toEqual([shape("shape-1"), shape("shape-3"), shape("shape-4", shape("shape-2"))]);
  });
});

// A VPC at (0,0)–(800,600), a cluster at (900,0)–(1300,300), a service at (1400,0)–(1500,80), each drawn apart.
function vpcClusterService(): EditorState {
  const vpc = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 800, y: 600 });
  const cluster = drawRectangle(vpc, { x: 900, y: 0 }, { x: 1300, y: 300 });
  return drawRectangle(cluster, { x: 1400, y: 0 }, { x: 1500, y: 80 });
}

// The cluster dragged into the middle of the VPC, at (200,150)–(600,450), and the service into the cluster, at
// (350,260)–(450,340).
function nested(): EditorState {
  const clusterInVpc = drag(vpcClusterService(), { x: 1100, y: 150 }, { x: 400, y: 300 });
  return drag(clusterInVpc, { x: 1450, y: 40 }, { x: 400, y: 300 });
}

describe("nested Containers", () => {
  test("a Shape joins the innermost Container under its centre", () => {
    expect(shapeTree(nested())).toEqual([shape("shape-1", shape("shape-2", shape("shape-3")))]);
  });

  test("a Shape dragged from an inner Container to the outer one moves up a level", () => {
    const state = drag(nested(), { x: 400, y: 300 }, { x: 100, y: 100 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2"), shape("shape-3"))]);
  });

  test("moving a Container moves everything inside it, and they stay inside it", () => {
    const state = drag(nested(), { x: 50, y: 50 }, { x: 150, y: 100 });

    expect(boundsById(state)).toEqual({
      "shape-1": { x: 100, y: 50, width: 800, height: 600 },
      "shape-2": { x: 300, y: 200, width: 400, height: 300 },
      "shape-3": { x: 450, y: 310, width: 100, height: 80 },
    });
    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2", shape("shape-3")))]);
  });

  test("moving a Container moves what is inside it even when they are selected too", () => {
    const allSelected = press(nested(), "a", { meta: true });

    const state = drag(allSelected, { x: 50, y: 50 }, { x: 150, y: 100 });

    expect(boundsById(state)["shape-3"]).toEqual({ x: 450, y: 310, width: 100, height: 80 });
    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2", shape("shape-3")))]);
  });

  test("nudging a Container moves everything inside it", () => {
    const state = press(click(nested(), { x: 50, y: 50 }), "ArrowRight", { shift: true });

    expect(boundsById(state)["shape-3"]).toEqual({ x: 360, y: 260, width: 100, height: 80 });
  });

  test("a Shape nudged across a Container's edge leaves it", () => {
    // The service's centre at (400,300) is 200 from the cluster's right edge, 21 nudges of 10.
    const selected = click(nested(), { x: 400, y: 300 });
    const state = Array.from({ length: 21 }).reduce<EditorState>(
      (moved) => press(moved, "ArrowRight", { shift: true }),
      selected,
    );

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2"), shape("shape-3"))]);
  });

  test("a Container can't be dropped into a Shape inside it", () => {
    // The VPC's centre is on the service, and stays there.
    const state = drag(nested(), { x: 10, y: 10 }, { x: 20, y: 20 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2", shape("shape-3")))]);
  });

  test("two Containers moved together can't each end up inside the other", () => {
    // Two top-level rectangles resized to overlap, each with its centre inside the other: (1000,0)–(1450,200) and
    // (1100,50)–(1500,250).
    const apart = drawRectangle(
      drawRectangle(newEditor(), { x: 1000, y: 0 }, { x: 1200, y: 200 }),
      { x: 1300, y: 50 },
      { x: 1500, y: 250 },
    );
    const widened = drag(click(apart, { x: 1100, y: 100 }), { x: 1200, y: 100 }, { x: 1450, y: 100 });
    const overlapping = drag(click(widened, { x: 1480, y: 150 }), { x: 1300, y: 150 }, { x: 1100, y: 150 });
    const bothSelected = press(overlapping, "a", { meta: true });

    const state = drag(bothSelected, { x: 1150, y: 150 }, { x: 1160, y: 160 });

    expect(shapeTree(overlapping)).toEqual([shape("shape-1"), shape("shape-2")]);

    expect(shapeTree(state)).toEqual([shape("shape-2", shape("shape-1"))]);
  });
});

describe("drawing a Container", () => {
  test("a new Container adopts the Shapes whose centres it covers", () => {
    const state = drawRectangle(vpcClusterService(), { x: 850, y: -50 }, { x: 1600, y: 400 });

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-4", shape("shape-2"), shape("shape-3"))]);
  });

  test("a new Container leaves the Shapes whose centres it doesn't cover", () => {
    const state = drawRectangle(vpcClusterService(), { x: 850, y: -50 }, { x: 1420, y: 400 });

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-3"), shape("shape-4", shape("shape-2"))]);
  });

  test("a Shape drawn inside a Container joins the innermost one", () => {
    const state = drawRectangle(nested(), { x: 220, y: 170 }, { x: 300, y: 230 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2", shape("shape-3"), shape("shape-4")))]);
  });

  test("a Container drawn around a Container whose centre it covers adopts it, with what is inside it", () => {
    // Drawn around the cluster, with its own centre on the service.
    const state = drawRectangle(nested(), { x: 150, y: 100 }, { x: 650, y: 500 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-4", shape("shape-2", shape("shape-3"))))]);
  });

  test("a Container drawn around most of a smaller Container adopts it", () => {
    // Around the cluster but for its bottom 10, with its centre on the cluster.
    const state = drawRectangle(nested(), { x: 150, y: 100 }, { x: 650, y: 440 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-4", shape("shape-2", shape("shape-3"))))]);
  });

  test("a Container drawn exactly over a Container adopts it", () => {
    const state = drawRectangle(nested(), { x: 200, y: 150 }, { x: 600, y: 450 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-4", shape("shape-2", shape("shape-3"))))]);
  });

  test("a Container drawn around a Container never goes inside a child sticking out of it", () => {
    // The cluster shrunk to (200,150)–(400,300), and the service widened to (350,260)–(700,340), sticking out of it.
    const shrunk = drag(click(nested(), { x: 250, y: 200 }), { x: 600, y: 450 }, { x: 400, y: 300 });
    const stickingOut = drag(click(shrunk, { x: 420, y: 320 }), { x: 450, y: 300 }, { x: 700, y: 300 });

    // Around the cluster, with its centre on the service, but not around all of the service.
    const state = drawRectangle(stickingOut, { x: 190, y: 140 }, { x: 600, y: 400 });

    expect(boundsById(stickingOut)["shape-3"]).toEqual({ x: 350, y: 260, width: 350, height: 80 });
    expect(shapeTree(stickingOut)).toEqual([shape("shape-1", shape("shape-2", shape("shape-3")))]);
    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-4", shape("shape-2", shape("shape-3"))))]);
  });

  test("a new Container only adopts Shapes at its own level", () => {
    // The service dragged into the VPC at (700,260)–(800,340), and a Container drawn outside the VPC over its centre.
    const serviceInVpc = drag(vpcClusterService(), { x: 1450, y: 40 }, { x: 750, y: 300 });

    const state = drawRectangle(serviceInVpc, { x: 690, y: 200 }, { x: 1090, y: 400 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-3")), shape("shape-2"), shape("shape-4")]);
  });

  test("a Container drawn between nested Containers goes between them", () => {
    // Inside the cluster, around the service, all three with the same centre.
    const state = drawRectangle(nested(), { x: 250, y: 200 }, { x: 550, y: 400 });

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2", shape("shape-4", shape("shape-3"))))]);
  });

  test("a Shape that can't be a Container adopts nothing", () => {
    const state = drawSymbol(vpcClusterService(), "cylinder", { x: 1050, y: -50 }, { x: 1600, y: 400 });

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-2"), shape("shape-3"), shape("shape-4")]);
  });
});

describe("resizing a Container", () => {
  test("shrinking a Container keeps its children inside it, sticking out", () => {
    // The VPC's bottom-right corner dragged in past the cluster's centre.
    const state = drag(click(nested(), { x: 50, y: 50 }), { x: 800, y: 600 }, { x: 300, y: 250 });

    expect(boundsById(state)["shape-1"]).toEqual({ x: 0, y: 0, width: 300, height: 250 });
    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2", shape("shape-3")))]);
  });

  test("growing a Container over a Shape doesn't adopt it", () => {
    const state = drag(click(vpcClusterService(), { x: 50, y: 50 }), { x: 800, y: 600 }, { x: 1600, y: 600 });

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-2"), shape("shape-3")]);
  });
});

describe("deleting a Container", () => {
  test("deletes everything inside it", () => {
    const withOther = drawRectangle(nested(), { x: 1000, y: 0 }, { x: 1100, y: 80 });

    const state = press(click(withOther, { x: 50, y: 50 }), "Delete");

    expect(selection(press(state, "a", { meta: true }))).toEqual(["shape-4"]);
  });

  test("deleting a child leaves its Container", () => {
    const state = press(click(nested(), { x: 400, y: 300 }), "Delete");

    expect(selection(press(state, "a", { meta: true }))).toEqual(["shape-1", "shape-2"]);
    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2"))]);
  });

  test("undo puts back the Container and everything that was inside it, in one step", () => {
    const deleted = press(click(nested(), { x: 50, y: 50 }), "Delete");

    const state = undo(deleted);

    expect(shapeTree(state)).toEqual([shape("shape-1", shape("shape-2", shape("shape-3")))]);
    expect(boundsById(state)).toEqual(boundsById(nested()));
  });
});

describe("undoing containment", () => {
  test("a drop into a Container undoes as one step, along with the move", () => {
    const dropped = drag(containerAndShape(), { x: 650, y: 140 }, { x: 300, y: 250 });

    const state = undo(dropped);

    expect(shapeTree(state)).toEqual([shape("shape-1"), shape("shape-2")]);
    expect(boundsById(state)).toEqual(boundsById(containerAndShape()));
    expect(shapeTree(redo(state))).toEqual(shapeTree(dropped));
  });

  test("a drag out of a Container undoes as one step", () => {
    const inside = drag(containerAndShape(), { x: 650, y: 140 }, { x: 300, y: 250 });

    expect(shapeTree(undo(drag(inside, { x: 300, y: 250 }, { x: 700, y: 250 })))).toEqual(shapeTree(inside));
  });

  test("a nudge out of a Container undoes as one step", () => {
    // The Shape's centre 5 inside the Container's right edge.
    const inside = drag(containerAndShape(), { x: 650, y: 140 }, { x: 495, y: 250 });
    const nudged = press(inside, "ArrowRight", { shift: true });

    expect(shapeTree(nudged)).toEqual([shape("shape-1"), shape("shape-2")]);
    expect(shapeTree(undo(nudged))).toEqual(shapeTree(inside));
  });

  test("drawing a Container and the Shapes it adopts undo as one step", () => {
    const drawn = drawRectangle(vpcClusterService(), { x: 850, y: -50 }, { x: 1600, y: 400 });

    expect(shapeTree(undo(drawn))).toEqual(shapeTree(vpcClusterService()));
  });
});

// A VPC shape-1 at (0,0)–(800,600) with two services inside it, shape-2 at (100,100)–(200,180) and shape-3 at
// (400,100)–(500,180), and a database shape-4 outside it at (1000,100)–(1100,180). The services' left and right
// Ports are at (100,140), (200,140), (400,140) and (500,140), and the database's left Port at (1000,140).
function vpcWithServices(): EditorState {
  const vpc = drawRectangle(newEditor(), { x: 0, y: 0 }, { x: 800, y: 600 });
  const first = drawRectangle(vpc, { x: 100, y: 100 }, { x: 200, y: 180 });
  const second = drawRectangle(first, { x: 400, y: 100 }, { x: 500, y: 180 });
  return drawRectangle(second, { x: 1000, y: 100 }, { x: 1100, y: 180 });
}

function pathOf(state: EditorState, id: ShapeId): readonly Point[] | undefined {
  return arrows(state).find((arrow) => arrow.id === id)?.path;
}

describe("Arrows inside Containers", () => {
  test("an Arrow between two services in a VPC belongs to the VPC and moves with it", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 400, y: 140 });

    const moved = drag(withArrow, { x: 50, y: 50 }, { x: 150, y: 100 });

    expect(shapeTree(withArrow)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3"), shape("shape-5")),
      shape("shape-4"),
    ]);
    expect(pathOf(moved, "shape-5")).toEqual([
      { x: 300, y: 190 },
      { x: 500, y: 190 },
    ]);
    expect(shapeTree(moved)).toEqual(shapeTree(withArrow));
  });

  test("an Arrow from a service in a VPC to a database outside it belongs to the top level", () => {
    const state = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 1000, y: 140 });

    expect(shapeTree(state)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3")),
      shape("shape-4"),
      shape("shape-5"),
    ]);
  });

  test("an Arrow from a service in a VPC to a floating end inside it belongs to the VPC and moves with it", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 300, y: 300 });

    const moved = drag(withArrow, { x: 50, y: 50 }, { x: 150, y: 100 });

    expect(shapeTree(withArrow)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3"), shape("shape-5")),
      shape("shape-4"),
    ]);
    expect(pathOf(moved, "shape-5")).toEqual([
      { x: 300, y: 190 },
      { x: 400, y: 350 },
    ]);
  });

  test("an Arrow with both ends floating inside a VPC belongs to the VPC and moves with it", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 300, y: 300 }, { x: 600, y: 400 });

    const moved = drag(withArrow, { x: 50, y: 50 }, { x: 150, y: 100 });

    expect(shapeTree(withArrow)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3"), shape("shape-5")),
      shape("shape-4"),
    ]);
    expect(pathOf(moved, "shape-5")).toEqual([
      { x: 400, y: 350 },
      { x: 700, y: 450 },
    ]);
  });

  test("an Arrow with an end floating outside every Container belongs to the top level", () => {
    const bound = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 900, y: 300 });
    const floating = drawArrow(bound, { x: 300, y: 300 }, { x: 900, y: 400 });

    expect(shapeTree(floating)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3")),
      shape("shape-4"),
      shape("shape-5"),
      shape("shape-6"),
    ]);
  });

  test("moving a bound service out of the VPC moves the Arrow to the top level", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 400, y: 140 });

    const state = drag(withArrow, { x: 450, y: 160 }, { x: 950, y: 460 });

    expect(shapeTree(state)).toEqual([
      shape("shape-1", shape("shape-2")),
      shape("shape-4"),
      shape("shape-3"),
      shape("shape-5"),
    ]);
  });

  test("dragging an Arrow's end into the VPC moves the Arrow into it", () => {
    const outside = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 900, y: 300 });

    const state = drag(outside, { x: 900, y: 300 }, { x: 300, y: 300 });

    expect(shapeTree(state)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3"), shape("shape-5")),
      shape("shape-4"),
    ]);
  });

  test("a Container drawn around an Arrow's ends adopts the Arrow", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 1000, y: 140 }, { x: 1000, y: 400 });

    const state = drawRectangle(withArrow, { x: 900, y: 50 }, { x: 1200, y: 500 });

    expect(shapeTree(state)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3")),
      shape("shape-6", shape("shape-4"), shape("shape-5")),
    ]);
  });

  test("a Container drawn around an Arrow's ends adopts the Arrow while its Label is still open", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 1000, y: 140 }, { x: 1000, y: 400 });

    const state = drawWithLabelOpen(withArrow, "rectangle", { x: 900, y: 50 }, { x: 1200, y: 500 });

    expect(shapeTree(state)).toEqual([
      shape("shape-1", shape("shape-2"), shape("shape-3")),
      shape("shape-6", shape("shape-4"), shape("shape-5")),
    ]);
  });

  test("deleting the VPC deletes the Arrows it owns, and leaves those crossing its boundary with floating ends", () => {
    const inside = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 400, y: 140 });
    const crossing = drawArrow(inside, { x: 500, y: 140 }, { x: 1000, y: 140 });

    const state = press(click(crossing, { x: 50, y: 50 }), "Delete");

    expect(shapeTree(state)).toEqual([shape("shape-4"), shape("shape-6")]);
    expect(arrows(state)).toEqual([
      expect.objectContaining({
        id: "shape-6",
        start: { point: { x: 500, y: 140 } },
        end: { point: { x: 1000, y: 140 }, binding: { shape: "shape-4", port: 3 } },
      }),
    ]);
  });
});

// The Shapes in SVG text, in the order it draws them.
function shapesIn(svg: string): readonly (string | undefined)[] {
  return [...svg.matchAll(/data-shape="([^"]+)"/g)].map(([, id]) => id);
}

describe("stacking order of Arrows", () => {
  test("an Arrow is drawn above the Shapes at its own level, even those drawn after it", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 400, y: 140 });

    const state = drawRectangle(withArrow, { x: 100, y: 300 }, { x: 200, y: 380 });

    expect(shapesIn(svgText(rendering(state)))).toEqual([
      "shape-1",
      "shape-2",
      "shape-3",
      "shape-6",
      "shape-5",
      "shape-4",
    ]);
  });

  test("bringing a Shape an Arrow connects to to the front leaves the Arrow above it", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 1000, y: 140 });

    const state = press(click(withArrow, { x: 1050, y: 140 }), "]");

    expect(shapesIn(svgText(rendering(state)))).toEqual(["shape-1", "shape-2", "shape-3", "shape-4", "shape-5"]);
  });

  test("sending an Arrow to the back only sends it behind the other Arrows at its level", () => {
    const first = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 1000, y: 140 });
    const second = drawArrow(first, { x: 900, y: 300 }, { x: 900, y: 500 });

    const state = press(second, "[");

    expect(shapesIn(svgText(rendering(state)))).toEqual([
      "shape-1",
      "shape-2",
      "shape-3",
      "shape-4",
      "shape-6",
      "shape-5",
    ]);
  });

  test("a Shape stepping forward passes the next Shape above it, not an Arrow drawn before that Shape", () => {
    const withArrow = drawArrow(vpcWithServices(), { x: 200, y: 140 }, { x: 1000, y: 140 });
    const withShape = drawRectangle(withArrow, { x: 900, y: 300 }, { x: 1000, y: 380 });

    const state = press(click(withShape, { x: 1050, y: 140 }), "]", { meta: true });

    expect(shapesIn(svgText(rendering(state)))).toEqual([
      "shape-1",
      "shape-2",
      "shape-3",
      "shape-6",
      "shape-4",
      "shape-5",
    ]);
  });
});
