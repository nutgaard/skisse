import { expect, test, type Page } from "@playwright/test";

async function drawRectangle(page: Page, x: number, y: number) {
  await page.getByRole("button", { name: "Rectangle", exact: true }).click();
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 150, y + 80, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Escape");
}

test("the style panel shows the selection's style, and mixed values where the selected Shapes differ", async ({
  page,
}) => {
  await page.goto("./");
  const panel = page.getByRole("toolbar", { name: "Style" });
  const stroke = panel.getByRole("group", { name: "Stroke", exact: true });
  const red = stroke.getByRole("button", { name: "Red stroke" });
  const black = stroke.getByRole("button", { name: "Black stroke" });

  await drawRectangle(page, 200, 150);
  await red.click();
  await expect(red).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-symbol="rectangle"] path[stroke]').first()).toHaveAttribute("stroke", "#e03131");

  await page.keyboard.press("Escape");
  await black.click();
  await drawRectangle(page, 450, 150);
  await expect(black).toHaveAttribute("aria-pressed", "true");

  await page.keyboard.press("Control+a");
  await expect(stroke).toContainText("mixed");
  await expect(red).toHaveAttribute("aria-pressed", "false");
  await expect(black).toHaveAttribute("aria-pressed", "false");
  await expect(panel.getByRole("button", { name: "Transparent fill" })).toHaveAttribute("aria-pressed", "true");
});

test("the style panel aligns the selected Shape's Label, and has nothing to align with nothing selected", async ({
  page,
}) => {
  await page.goto("./");
  const align = page.getByRole("toolbar", { name: "Style" }).getByRole("group", { name: "Align" });
  const left = align.getByRole("button", { name: "Align left" });
  const right = align.getByRole("button", { name: "Align right" });

  await drawRectangle(page, 200, 150);
  await expect(left).toHaveAttribute("aria-pressed", "true");
  await right.click();
  await expect(right).toHaveAttribute("aria-pressed", "true");
  await expect(left).toHaveAttribute("aria-pressed", "false");

  await page.keyboard.press("Escape");
  await expect(right).toBeDisabled();
  await expect(right).toHaveAttribute("aria-pressed", "false");
});
