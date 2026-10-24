import { expect, test, type Page } from "@playwright/test";

async function dragOnPage(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

async function drawRectangle(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await dragOnPage(page, { x, y }, { x: x + 150, y: y + 80 });
  await page.keyboard.press("Escape");
}

// Two rectangles side by side, and an Arrow from the first one's right Port at (350,190) to the second one's left Port
// at (600,190). The Arrow is selected.
async function drawArrowBetweenRectangles(page: Page) {
  await page.goto("./");
  await drawRectangle(page, 200, 150);
  await drawRectangle(page, 600, 150);
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  await dragOnPage(page, { x: 352, y: 190 }, { x: 598, y: 190 });
}

test("an Arrow's heads are chosen for each end in the style panel", async ({ page }) => {
  await drawArrowBetweenRectangles(page);
  const heads = page.getByRole("toolbar", { name: "Style" }).getByRole("group", { name: "Arrowheads" });

  const arrowAtEnd = heads.getByRole("button", { name: "Arrow at the end", exact: true });
  await expect(arrowAtEnd).toHaveAttribute("aria-pressed", "true");
  await heads.getByRole("button", { name: "Diamond at the start" }).click();

  await expect(page.locator('[data-arrowhead="start"]')).toHaveCount(1);
  await expect(heads.getByRole("button", { name: "Diamond at the start" })).toHaveAttribute("aria-pressed", "true");
});

test("an Arrow's Label is typed in place, without wrapping, and dragged along the Arrow", async ({ page }) => {
  await drawArrowBetweenRectangles(page);

  await page.keyboard.press("Enter");
  const field = page.getByRole("textbox", { name: "Label" });
  await expect(field).toBeFocused();
  await page.keyboard.type("publishes events");
  const { scrollHeight, clientHeight } = await field.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
  await page.keyboard.press("Escape");

  const label = page.locator("[data-routing] text");
  await expect(label).toHaveText("publishes events");
  const before = await label.boundingBox();
  if (!before) throw new Error("the Label has no box");
  // Grabbed above the line, and dragged right along it.
  const grabbed = { x: before.x + before.width / 2, y: before.y + 4 };
  await dragOnPage(page, grabbed, { x: grabbed.x + 50, y: grabbed.y + 30 });

  const after = await label.boundingBox();
  expect(after?.x).toBeCloseTo(before.x + 50);
  expect(after?.y).toBeCloseTo(before.y);
});
