import { expect, test } from "@playwright/test";

test("drawing a rectangle shows it on the Sketch, also while dragging, and it is still there after a reload", async ({
  page,
}) => {
  await page.goto("./");
  const rectangle = page.locator('[data-symbol="rectangle"]');

  await page.getByRole("button", { name: "Rectangle" }).click();
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
  await expect(rectangle).toHaveAttribute("x", "200");
  await expect(rectangle).toHaveAttribute("y", "150");
  await expect(rectangle).toHaveAttribute("width", "100");
  await expect(rectangle).toHaveAttribute("height", "50");
});
