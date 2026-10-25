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

test("Shapes copied in one tab paste into a new Sketch in another", async ({ context }) => {
  const source = await context.newPage();
  await source.goto("./");
  await drawRectangle(source, 200, 150, "Orders");
  await drawRectangle(source, 400, 150, "Users");
  await source.keyboard.press("ControlOrMeta+A");
  await source.keyboard.press("ControlOrMeta+C");

  const target = await context.newPage();
  await target.goto("./");
  await target.getByRole("button", { name: "Sketches" }).click();
  await target.getByRole("button", { name: "New sketch" }).click();
  await expect(target.locator("[data-symbol]")).toHaveCount(0);
  await target.locator("svg.sketch").click({ position: { x: 600, y: 500 } });
  await target.keyboard.press("ControlOrMeta+V");

  await expect(target.locator('[data-symbol="rectangle"] text')).toHaveText(["Orders", "Users"]);
});
