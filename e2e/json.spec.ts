import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

async function drawRectangle(page: Page, x: number, y: number, label: string) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 100, y + 80, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type(label);
  await page.keyboard.press("Escape");
}

async function importFile(page: Page, name: string, text: string | Buffer) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Import sketch" }).click();
  await (await chooser).setFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}

function zoomButton(page: Page) {
  return page.getByRole("button", { name: "Reset zoom to 100%" });
}

function sketchNames(page: Page) {
  return page.getByRole("region", { name: "Sketch list" }).locator(".sketch-open");
}

test("an exported Sketch imports as a new Sketch, and the one it came from is left as it is", async ({ page }) => {
  await page.goto("./");
  await drawRectangle(page, 200, 150, "Orders");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const exported = await download;
  expect(exported.suggestedFilename()).toBe("Sketch 1.json");
  await drawRectangle(page, 400, 150, "Users");

  await page.getByRole("button", { name: "Sketches" }).click();
  await importFile(page, exported.suggestedFilename(), await readFile(await exported.path()));

  await expect(sketchNames(page)).toHaveText(["Sketch 1", "Sketch 1 (2)"]);
  await expect(page.locator('li[aria-current="true"]')).toContainText("Sketch 1 (2)");
  await expect(page.locator('[data-symbol="rectangle"] text')).toHaveText(["Orders"]);

  await page.getByRole("button", { name: "Sketch 1", exact: true }).click();
  await expect(page.locator('[data-symbol="rectangle"] text')).toHaveText(["Orders", "Users"]);
});

test("an exported Sketch imports at the zoom and pan it was exported at", async ({ page }) => {
  await page.goto("./");
  await drawRectangle(page, 500, 300, "Orders");
  await page.mouse.move(700, 400);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, 50);
  await page.keyboard.up("Control");
  await page.mouse.wheel(40, 60);
  const exportedAt = await page.locator('[data-symbol="rectangle"] path').first().boundingBox();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export JSON" }).click();
  const exported = await download;
  await zoomButton(page).click();

  await page.getByRole("button", { name: "Sketches" }).click();
  await importFile(page, exported.suggestedFilename(), await readFile(await exported.path()));

  await expect(sketchNames(page)).toHaveText(["Sketch 1", "Sketch 1 (2)"]);
  await expect(zoomButton(page)).toHaveText("71%");
  expect(await page.locator('[data-symbol="rectangle"] path').first().boundingBox()).toEqual(exportedAt);

  await page.reload();
  await expect(zoomButton(page)).toHaveText("71%");
});

test("a file that can't be imported shows why, and imports nothing", async ({ page }) => {
  await page.goto("./");
  await drawRectangle(page, 200, 150, "Orders");
  await page.getByRole("button", { name: "Sketches" }).click();

  const newer = JSON.stringify({ format: "skisse/sketch", version: 999, shapes: {} });
  await importFile(page, "Newer.json", newer);

  await expect(page.getByRole("alert")).toHaveText(/format version 999, from a newer Skisse/);
  await expect(sketchNames(page)).toHaveText(["Sketch 1"]);
  await expect(page.locator('[data-symbol="rectangle"] text')).toHaveText(["Orders"]);
});
