import { describe, expect, test } from "vitest";
import { activeTool } from "./queries";
import { apply, newEditor, press, selectTool } from "./test-helpers";

describe("tools", () => {
  test("the select tool is active in a new editor", () => {
    expect(activeTool(newEditor())).toBe("select");
  });

  test("selecting the rectangle tool makes it the active tool", () => {
    expect(activeTool(apply(newEditor(), selectTool("rectangle")))).toBe("rectangle");
  });
});

describe("tool shortcuts", () => {
  test.each([
    ["v", "select"],
    ["h", "pan"],
    ["r", "rectangle"],
  ] as const)("pressing %s selects the %s tool", (key, tool) => {
    const otherTool = tool === "select" ? "pan" : "select";

    expect(activeTool(press(apply(newEditor(), selectTool(otherTool)), key))).toBe(tool);
  });

  test("a shortcut also works with caps lock or shift held", () => {
    expect(activeTool(press(newEditor(), "R", { shift: true }))).toBe("rectangle");
  });

  test("a shortcut with Cmd or Ctrl held is a command, not a tool", () => {
    expect(activeTool(press(newEditor(), "r", { meta: true }))).toBe("select");
    expect(activeTool(press(newEditor(), "r", { ctrl: true }))).toBe("select");
  });
});
