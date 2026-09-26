import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { addText, adminLogin, download, fillCheckout, layers, openStudio, placeAndPay } from "./helpers";

/**
 * AI acceptance journey. Uses the local test provider (AI_IMAGE_PROVIDER=fixture,
 * see playwright.config.ts): the real endpoint, streaming, limits, storage,
 * insertion, pricing, ordering and production — only the image model is local.
 */
test("AI: generate a design, place it, edit, order, and staff can produce it", async ({ page, browser }) => {
  await openStudio(page, "/studio/classic-crew-tshirt");
  await page.getByRole("radio", { name: "Black", exact: true }).click();

  // empty state offers the three ways to start
  const start = page.getByTestId("design-start");
  await expect(start.getByRole("heading", { name: "What would you like to create?" })).toBeVisible();
  await start.getByTestId("ai-open").click();

  const dialog = page.getByTestId("ai-dialog");
  await expect(dialog.getByRole("heading", { name: "Create your design with AI" })).toBeVisible();
  await expect(dialog.getByTestId("ai-quota")).toContainText("10 of 10");
  await dialog.getByRole("button", { name: "Streetwear tiger" }).click();
  await expect(dialog.getByLabel("What do you want to create?")).toHaveValue(/tiger/);
  await dialog.getByRole("button", { name: "Streetwear", exact: true }).click();
  await dialog.getByTestId("ai-generate").click();

  // staged progress, then variations
  await expect(dialog.getByTestId("ai-progress")).toBeVisible();
  await expect(dialog.getByTestId("ai-results")).toBeVisible({ timeout: 60_000 });
  // the first option shows while the second is still being created
  await expect(dialog.getByTestId("ai-variation-pending")).toBeVisible();
  const cards = dialog.getByTestId("ai-variation");
  await expect(cards).toHaveCount(2);
  await expect(dialog.getByTestId("ai-results")).toContainText("“STAY WILD”");

  // insert: the artwork + the requested words as editable text, nothing erased
  await cards.first().getByRole("button", { name: "Use this design" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId("image-inspector")).toBeVisible();
  await expect(layers(page)).toHaveCount(2);

  // it behaves like any artwork: move, resize, rotate
  await page.getByRole("button", { name: "Move up 2 mm" }).click();
  await page.getByLabel("Image width").fill("180");
  await expect(page.getByTestId("image-inspector").getByText("18.0 cm")).toBeVisible();
  await page.getByLabel("Rotation", { exact: true }).fill("-8");
  await expect(page.getByTestId("image-inspector").getByText("-8°")).toBeVisible();

  // add more text; generating again never removes existing work
  await addText(page, "front", "EST. 2026");
  await expect(layers(page)).toHaveCount(3);
  await page.getByTestId("ai-open").first().click();
  await expect(dialog.getByTestId("ai-results")).toBeVisible();
  await dialog.getByLabel("Want changes?").fill("make it more colourful");
  await dialog.getByRole("button", { name: "Refine" }).click();
  await expect(dialog.getByTestId("ai-results")).toContainText("make it more colourful", { timeout: 60_000 });
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(layers(page)).toHaveCount(3);

  // change shirt colour and side: the design stays
  await page.getByRole("radiogroup", { name: "Shirt colour" }).getByRole("radio", { name: "Navy", exact: true }).click();
  await page.getByRole("radio", { name: /^Back/ }).click();
  await page.getByRole("radio", { name: /^Front/ }).click();
  await expect(layers(page)).toHaveCount(3);

  // price, cart, order
  await page.getByRole("radio", { name: "Sizes & price" }).click();
  await page.getByRole("radio", { name: "M", exact: true }).click();
  await expect(page.getByTestId("order-total")).toContainText("₹");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.waitForURL("**/cart");
  await expect(page.getByTestId("cart-line").getByRole("img", { name: /front with your design/ })).toBeVisible();
  await page.getByRole("link", { name: "Checkout" }).click();
  await fillCheckout(page);
  const orderNumber = (await placeAndPay(page)).match(/SG-\d+/)![0];

  // staff see it marked as AI artwork and can download the stored files
  const admin = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await adminLogin(admin);
  await admin.goto(`/admin/orders/${orderNumber}`);
  await expect(admin.getByRole("img", { name: "front design as ordered" })).toBeVisible();
  await expect(admin.getByText(/AI-generated image/)).toBeVisible();
  await expect(admin.getByText("AI-generated", { exact: true })).toBeVisible();
  await expect(admin.getByText(/Text “STAY WILD”/)).toBeVisible();
  const original = await download(admin, /Original: ai-design-1\.png/);
  expect(fs.statSync(original.path).size).toBeGreaterThan(1_000);
  const front = await download(admin, /_FRONT_DTF\.png/);
  expect(fs.statSync(front.path).size).toBeGreaterThan(10_000);
});

test("AI: cancel keeps the design, safety refusals are explained", async ({ page }) => {
  await openStudio(page, "/studio/classic-crew-tshirt");
  await addText(page, "front", "KEEP ME");
  await page.getByTestId("ai-open").first().click();
  const dialog = page.getByTestId("ai-dialog");
  const promptBox = dialog.getByLabel("What do you want to create?");

  await promptBox.fill("A calm mountain lake at dawn");
  await dialog.getByTestId("ai-generate").click();
  await expect(dialog.getByTestId("ai-progress")).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog.getByTestId("ai-generate")).toBeVisible();

  await promptBox.fill("FIXTURE_REFUSE something not allowed");
  await dialog.getByTestId("ai-generate").click();
  await expect(dialog.getByText("This request can't be generated. Try describing a different design idea.")).toBeVisible({ timeout: 30_000 });

  await promptBox.fill("FIXTURE_FAIL a provider outage");
  await dialog.getByTestId("ai-generate").click();
  await expect(dialog.getByText("Something went wrong while creating your artwork. Your design is safe. Please try again.")).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByRole("button", { name: "Try again" })).toBeVisible();

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(layers(page)).toHaveCount(1);
});

test("AI: type 'bear', place it, make it bigger/smaller and rotate it", async ({ page }) => {
  await openStudio(page, "/studio/classic-crew-tshirt");
  await page.getByTestId("design-start").getByTestId("ai-open").click();
  const dialog = page.getByTestId("ai-dialog");
  await dialog.getByLabel("What do you want to create?").fill("bear");
  await dialog.getByTestId("ai-generate").click();
  await dialog.getByTestId("ai-variation").first().getByRole("button", { name: "Use this design" }).click();

  const inspector = page.getByTestId("image-inspector");
  await expect(inspector).toBeVisible();
  const width = async () => Number((await page.getByLabel("Image width").inputValue()) || 0);
  const start = await width();
  await inspector.getByRole("button", { name: "Make image bigger" }).click();
  await expect.poll(width).toBeGreaterThan(start);
  const bigger = await width();
  await inspector.getByRole("button", { name: "Make image smaller" }).click();
  await inspector.getByRole("button", { name: "Make image smaller" }).click();
  await expect.poll(width).toBeLessThan(bigger);
  await inspector.getByRole("button", { name: "Rotate right" }).click();
  await expect(inspector.getByText("15°")).toBeVisible();
  await inspector.getByRole("button", { name: "Rotate left" }).click();
  await inspector.getByRole("button", { name: "Rotate left" }).click();
  await expect(inspector.getByText("-15°")).toBeVisible();
  await expect(layers(page)).toHaveCount(1);
});
