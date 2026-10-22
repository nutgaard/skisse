import { describe, expect, test } from "vitest";
import { activeTool } from "./queries";
import { apply, newEditor, selectTool } from "./test-helpers";

describe("tools", () => {
  test("the select tool is active in a new editor", () => {
    expect(activeTool(newEditor())).toBe("select");
  });

  test("selecting the rectangle tool makes it the active tool", () => {
    expect(activeTool(apply(newEditor(), selectTool("rectangle")))).toBe("rectangle");
  });
});
