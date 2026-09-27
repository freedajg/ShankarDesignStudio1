import { expect, test } from "@playwright/test";

/** Tablet (820 px): canvas + side panel with Shirt / Design / Sizes tabs; no phone bottom bar. */
test("tablet: design with the side panel and switch to dark mode", async ({ page }) => {
  await page.goto("/studio/classic-crew-tshirt");
  await expect(page.getByTestId("design-stage")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });

  // tablet layout: side panel yes, phone tab bar and desktop left rail no
  await expect(page.getByRole("complementary", { name: "Design tools" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Studio tools" })).toBeHidden();
  await expect(page.getByRole("complementary", { name: "Product options" })).toBeHidden();

  // shirt options live in the Shirt tab
  const panel = page.getByRole("radiogroup", { name: "Panel" });
  await panel.getByRole("radio", { name: "Shirt" }).click();
  await page.getByRole("radiogroup", { name: "Shirt colour" }).getByRole("radio", { name: "Black", exact: true }).click();
  await expect(page.getByTestId("colour-name")).toHaveText("Black");
  await page.getByRole("radio", { name: /^Oversized front/ }).click();

  // design tab: add text, edit it in the panel (no bottom sheet on tablets)
  await panel.getByRole("radio", { name: "Design" }).click();
  await page.getByLabel("Add text to the front").fill("TABLET");
  await page.getByRole("button", { name: "Add text", exact: true }).click();
  await expect(page.getByTestId("text-inspector")).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Edit text" })).toHaveCount(0);

  // sizes tab
  await panel.getByRole("radio", { name: "Sizes" }).click();
  await page.getByRole("radio", { name: "L", exact: true }).click();
  await expect(page.getByTestId("order-total")).toContainText("₹");

  // appearance: dark mode applies at once and is remembered
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByTestId("theme-toggle").click();
  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("tablet: shop pages fit the screen", async ({ page }) => {
  for (const path of ["/", "/products/classic-crew-tshirt", "/bulk", "/cart"]) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});
