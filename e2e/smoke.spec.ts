import { expect, test } from "@playwright/test";

test("drawing a rectangle shows it on the Sketch, also while dragging, and it is still there after a reload", async ({
  page,
}) => {
  await page.goto("./");
  const rectangle = page.locator('[data-symbol="rectangle"]');

  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.mouse.move(200, 150);
  await page.mouse.down();
  await page.mouse.move(300, 200, { steps: 5 });

  await expect(rectangle).toHaveCount(1);
  await expect(rectangle).toBeVisible();

  await page.mouse.up();

  await expect(rectangle).toHaveCount(1);
  await expect(rectangle).toBeVisible();

  await page.reload();

  await expect(rectangle).toHaveCount(1);
  // The fill has no stroke, so its box is exactly the Shape's.
  expect(await rectangle.locator(".shape-fill").boundingBox()).toEqual({ x: 200, y: 150, width: 100, height: 50 });
});

test("the toolbar has a tool for every Symbol, each placing its Symbol with a click", async ({ page }) => {
  const symbols = [
    ["Rectangle", "rectangle"],
    ["Rounded rectangle", "roundedRectangle"],
    ["Ellipse", "ellipse"],
    ["Diamond", "diamond"],
    ["Cylinder", "cylinder"],
    ["Queue", "horizontalCylinder"],
    ["Document", "document"],
    ["Cloud", "cloud"],
    ["Person", "person"],
    ["Text", "text"],
  ];
  await page.goto("./");

  for (const [index, [name, symbol]] of symbols.entries()) {
    await page.getByRole("button", { name, exact: true }).click();
    await page.mouse.click(100 + (index % 5) * 200, 200 + Math.floor(index / 5) * 200);

    await expect(page.locator(`[data-symbol="${symbol}"]`)).toHaveCount(1);
    await expect(page.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
  }
});

test("a tool's shortcut selects it", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("toolbar").waitFor();

  await page.keyboard.press("c");

  await expect(page.getByRole("button", { name: "Cylinder" })).toHaveAttribute("aria-pressed", "true");
});
