import { expect, test } from "@playwright/test";

test("drawing a rectangle shows it on the Sketch", async ({ page }) => {
  await page.goto("./");

  await page.getByRole("button", { name: "Rectangle" }).click();
  await page.mouse.move(200, 150);
  await page.mouse.down();
  await page.mouse.move(300, 200, { steps: 5 });
  await page.mouse.up();

  const rectangle = page.locator('[data-symbol="rectangle"]');
  await expect(rectangle).toHaveCount(1);
  await expect(rectangle).toBeVisible();
});
