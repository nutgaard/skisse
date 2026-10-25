import { expect, test, type Page } from "@playwright/test";

const sketchArea = { x: 700, y: 400 };

function zoomButton(page: Page) {
  return page.getByRole("button", { name: "Reset zoom to 100%" });
}

// Each step zooms out by the same factor: one step is 71%, two are 50%.
async function zoomOut(page: Page, steps: number) {
  await page.mouse.move(sketchArea.x, sketchArea.y);
  await page.keyboard.down("Control");
  for (let step = 0; step < steps; step++) await page.mouse.wheel(0, 50);
  await page.keyboard.up("Control");
}

async function pan(page: Page, x: number, y: number) {
  await page.mouse.move(sketchArea.x, sketchArea.y);
  await page.mouse.wheel(x, y);
}

async function drawRectangle(page: Page) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.mouse.move(200, 150);
  await page.mouse.down();
  await page.mouse.move(300, 230, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
}

function rectangleBox(page: Page) {
  return page.locator('[data-symbol="rectangle"] path').first().boundingBox();
}

function openSketch(page: Page, name: string) {
  return page.getByRole("region", { name: "Sketch list" }).getByRole("button", { name, exact: true }).click();
}

test("a Sketch reopens after a reload at the zoom and pan it was left at", async ({ page }) => {
  await page.goto("./");
  await drawRectangle(page);
  await zoomOut(page, 1);
  await pan(page, 40, 60);
  await expect(zoomButton(page)).toHaveText("71%");
  const left = await rectangleBox(page);

  await page.reload();

  await expect(zoomButton(page)).toHaveText("71%");
  expect(await rectangleBox(page)).toEqual(left);
});

test("each Sketch reopens at its own zoom, and a new one opens at 100%", async ({ page }) => {
  await page.goto("./");
  await zoomOut(page, 1);
  await page.getByRole("button", { name: "Sketches" }).click();

  await page.getByRole("button", { name: "New sketch" }).click();
  await expect(zoomButton(page)).toHaveText("100%");
  await zoomOut(page, 2);

  await openSketch(page, "Sketch 1");
  await expect(zoomButton(page)).toHaveText("71%");
  await openSketch(page, "Sketch 2");
  await expect(zoomButton(page)).toHaveText("50%");
});

test("panning and zooming add no undo step", async ({ page }) => {
  await page.goto("./");
  await drawRectangle(page);
  await zoomOut(page, 1);
  await pan(page, 40, 60);

  await page.getByRole("button", { name: "Undo" }).click();

  await expect(page.locator('[data-symbol="rectangle"]')).toHaveCount(0);
  await expect(zoomButton(page)).toHaveText("71%");
});

function storedViewports(page: Page) {
  return page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("skisse:viewport:")));
}

test("deleting a Sketch forgets its zoom and pan", async ({ page }) => {
  await page.goto("./");
  await zoomOut(page, 1);
  await expect.poll(() => storedViewports(page)).toHaveLength(1);
  await page.getByRole("button", { name: "Sketches" }).click();
  page.once("dialog", (dialog) => dialog.accept());

  await page.getByRole("button", { name: "Delete Sketch 1" }).click();

  await expect(zoomButton(page)).toHaveText("100%");
  expect(await storedViewports(page)).toEqual([]);
});
