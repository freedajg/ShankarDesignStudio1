import { expect, test } from "@playwright/test";
import { fillCheckout, fixture, placeAndPay } from "./helpers";

/** A customer completes a whole order from a phone. */
test("mobile: design with bottom sheets, then order and pay", async ({ page }) => {
  await page.goto("/studio/classic-crew-tshirt");
  await expect(page.getByTestId("design-stage")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  const tabs = page.getByRole("navigation", { name: "Studio tools" });

  await tabs.getByRole("button", { name: "Shirt" }).click();
  await page.getByRole("dialog", { name: "Shirt" }).getByRole("radio", { name: "Maroon", exact: true }).click();
  await page.getByRole("dialog", { name: "Shirt" }).getByRole("button", { name: "Close" }).click();

  await tabs.getByRole("button", { name: "Text" }).click();
  await page.getByRole("dialog", { name: "Add text" }).getByLabel("Add text to the front").fill("MOBILE MADE");
  await page.getByRole("dialog", { name: "Add text" }).getByRole("button", { name: "Add text" }).click();
  // the compact inspector opens for the new text
  await expect(page.getByRole("dialog", { name: "Edit text" })).toBeVisible();
  await page.getByRole("dialog", { name: "Edit text" }).getByRole("button", { name: "Close" }).click();

  await tabs.getByRole("button", { name: "Upload" }).click();
  await page.getByRole("dialog", { name: "Upload artwork" }).getByTestId("upload-input").setInputFiles(fixture("logo.png"));
  await expect(page.getByRole("dialog", { name: "Edit image" })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("dialog", { name: "Edit image" }).getByRole("button", { name: "Close" }).click();

  await tabs.getByRole("button", { name: "Sizes" }).click();
  const sheet = page.getByRole("dialog", { name: "Sizes & price" });
  await sheet.getByRole("radio", { name: "XL", exact: true }).click();
  await sheet.getByRole("button", { name: "Close" }).click();

  await expect(page.getByTestId("order-total")).toContainText("₹");
  await page.getByRole("button", { name: /^Add$/ }).click();
  await page.waitForURL("**/cart");
  await page.getByRole("link", { name: "Checkout" }).click();
  await fillCheckout(page);
  await placeAndPay(page);
  await expect(page.getByText("Thank you — your order is confirmed.")).toBeVisible();
});

test("mobile: generate artwork with AI from the start card", async ({ page }) => {
  await page.goto("/studio/classic-crew-tshirt");
  await expect(page.getByTestId("design-stage")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByTestId("design-start-mobile").getByTestId("ai-open").click();
  const dialog = page.getByTestId("ai-dialog");
  await expect(dialog.getByRole("heading", { name: "Create your design with AI" })).toBeVisible();
  // full-screen on phones
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
  await dialog.getByRole("button", { name: "Astronaut cat" }).click();
  await dialog.getByTestId("ai-generate").click();
  await expect(dialog.getByTestId("ai-variation").first()).toBeVisible({ timeout: 60_000 });
  await dialog.getByTestId("ai-variation").first().getByRole("button", { name: "Use this design" }).click();
  await expect(page.getByRole("dialog", { name: "Edit image" })).toBeVisible();
});

test("mobile: follows the phone's dark setting by default", async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: "dark", viewport: { width: 412, height: 915 } });
  const page = await ctx.newPage();
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await ctx.close();
});
