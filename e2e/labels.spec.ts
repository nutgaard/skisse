import { expect, test } from "@playwright/test";

const text = "Payments service handling refunds, chargebacks and settlement with the acquiring bank";

for (const size of ["Small text", "Medium text", "Large text"]) {
  test(`a Label wraps inside its Shape at the ${size.toLowerCase()} size, as the measurer predicted`, async ({
    page,
  }) => {
    await page.goto("./");
    await page.getByRole("button", { name: "Rectangle", exact: true }).click();
    await page.mouse.move(200, 150);
    await page.mouse.down();
    await page.mouse.move(400, 230, { steps: 5 });
    await page.mouse.up();
    await page.getByRole("button", { name: size }).click();
    await page.keyboard.type(text);
    await page.keyboard.press("Escape");

    const rectangle = page.locator('[data-symbol="rectangle"]');
    const lines = rectangle.locator("text");
    await expect(lines.first()).toBeVisible();
    expect(await lines.count()).toBeGreaterThan(1);
    expect((await lines.allTextContents()).join(" ")).toBe(text);

    // The outline, drawn first as the fill, has no stroke, so its box is exactly the Shape's. Its Label area is
    // inset by 8 on every side.
    const shape = await rectangle.locator("path").first().boundingBox();
    if (!shape) throw new Error("the rectangle is not drawn");
    for (const line of await lines.all()) {
      const box = await line.boundingBox();
      if (!box) throw new Error("a line of the Label is not drawn");
      expect(box.x).toBeGreaterThanOrEqual(shape.x + 8 - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(shape.x + shape.width - 8 + 0.5);
      expect(box.y).toBeGreaterThanOrEqual(shape.y);
      expect(box.y + box.height).toBeLessThanOrEqual(shape.y + shape.height);
    }
  });
}
