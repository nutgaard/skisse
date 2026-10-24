import { expect, test, type Page } from "@playwright/test";

const text = "Payments service handling refunds, chargebacks and settlement with the acquiring bank, client-server-architecture";

async function drawRectangle(page: Page) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.mouse.move(200, 150);
  await page.mouse.down();
  await page.mouse.move(400, 230, { steps: 5 });
  await page.mouse.up();
}

test("Enter on a selected Shape opens its Label for editing without changing it", async ({ page }) => {
  await page.goto("./");
  await drawRectangle(page);
  await page.keyboard.type("Orders");
  await page.keyboard.press("Escape");

  await page.keyboard.press("Enter");
  const field = page.getByRole("textbox", { name: "Label" });
  await expect(field).toBeFocused();
  await expect(field).toHaveValue("Orders");
  await page.keyboard.press("Escape");

  await expect(page.locator('[data-symbol="rectangle"] text')).toHaveText("Orders");
});

for (const size of ["Small text", "Medium text", "Large text"]) {
  test(`a Label wraps inside its Shape at the ${size.toLowerCase()} size, as the measurer predicted`, async ({
    page,
  }) => {
    await page.goto("./");
    await drawRectangle(page);
    await page.getByRole("button", { name: size }).click();
    await page.keyboard.type(text);

    // The text field is as high as the lines the measurer predicted, so it wraps into no more lines than that.
    const field = page.getByRole("textbox", { name: "Label" });
    const { scrollHeight, clientHeight } = await field.evaluate((element) => ({
      scrollHeight: element.scrollHeight,
      clientHeight: element.clientHeight,
    }));
    expect(scrollHeight).toBeLessThanOrEqual(clientHeight);

    await page.keyboard.press("Escape");

    const rectangle = page.locator('[data-symbol="rectangle"]');
    const lines = rectangle.locator("text");
    await expect(lines.first()).toBeVisible();
    expect(await lines.count()).toBeGreaterThan(1);
    expect((await lines.allTextContents()).join(" ").replaceAll("- ", "-")).toBe(text);

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

test("the Label's text field wraps as the Label does when zoomed", async ({ page }) => {
  await page.goto("./");
  await drawRectangle(page);
  await page.keyboard.type(text);
  await page.keyboard.press("Escape");
  // Zooms out to 35%, where text set at a font size scaled by the zoom wraps differently.
  await page.keyboard.down("Control");
  for (let step = 0; step < 3; step++) await page.mouse.wheel(0, 50);
  await page.keyboard.up("Control");
  await expect(page.getByRole("button", { name: "Reset zoom to 100%" })).toHaveText("35%");

  const shape = await page.locator('[data-symbol="rectangle"] path').first().boundingBox();
  if (!shape) throw new Error("the rectangle is not drawn");
  await page.mouse.dblclick(shape.x + shape.width / 2, shape.y + shape.height / 2);

  const field = page.getByRole("textbox", { name: "Label" });
  await expect(field).toHaveValue(text);
  const { scrollHeight, clientHeight } = await field.evaluate((element) => ({
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(scrollHeight).toBeLessThanOrEqual(clientHeight);
});
