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

test("an Arrow switched to elbow in the style panel shows a handle on its middle segment, which drags it", async ({
  page,
}) => {
  await page.goto("./");
  const routing = page.getByRole("toolbar", { name: "Style" }).getByRole("group", { name: "Routing" });
  const elbow = routing.getByRole("button", { name: "Elbow" });
  await drawRectangle(page, 200, 150);
  await drawRectangle(page, 500, 300);
  await page.getByRole("button", { name: "Arrow", exact: true }).click();
  // From the first rectangle's right Port to the second's left Port.
  await dragOnPage(page, { x: 348, y: 190 }, { x: 502, y: 340 });

  const handle = page.locator(".segment-handle");
  await expect(handle).toHaveCount(0);
  await elbow.click();
  await expect(elbow).toHaveAttribute("aria-pressed", "true");
  await expect(handle).toHaveAttribute("data-segment-axis", "x");

  const before = await handle.boundingBox();
  if (!before) throw new Error("the handle has no box");
  const middle = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
  await dragOnPage(page, middle, { x: middle.x - 30, y: middle.y + 20 });

  const after = await handle.boundingBox();
  expect(after?.x).toBeCloseTo(before.x - 30);
  expect(after?.y).toBeCloseTo(before.y);
});
