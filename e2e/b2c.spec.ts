import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { addText, adminLogin, download, fillCheckout, layers, orderTotal, placeAndPay, upload } from "./helpers";

/** Brief §53 — the B2C acceptance scenario, end to end. */
test("B2C: design front and back, change colour, order, pay, and produce", async ({ page, browser }) => {
  // 1–3: open the studio, choose the T-shirt, choose black
  await page.goto("/");
  await page.getByRole("link", { name: /Classic Crew T-Shirt/ }).first().click();
  await page.getByRole("link", { name: "Design this shirt" }).click();
  await expect(page.getByTestId("design-stage")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await page.getByRole("radio", { name: "Black", exact: true }).click();
  await expect(page.getByTestId("colour-name")).toHaveText("Black");

  // 4–8: add text, change font and colour, move and resize it
  await addText(page, "front", "JAIPUR RUNNERS");
  await page.getByRole("radio", { name: "Oswald" }).click();
  await page.getByRole("radio", { name: "Gold" }).click();
  await page.getByRole("button", { name: "Move right 2 mm" }).click();
  await page.getByRole("button", { name: "Move down 2 mm" }).click();
  await page.getByLabel("Text size").fill("30");
  await expect(page.getByTestId("text-inspector").getByText("3.0 cm")).toBeVisible();

  // 9–11: upload PNG artwork, move and rotate it
  await upload(page, "logo.png");
  await page.getByRole("button", { name: "Move up 2 mm" }).click();
  await page.getByLabel("Rotation", { exact: true }).fill("15");
  await expect(page.getByTestId("image-inspector").getByText("15°")).toBeVisible();
  await expect(layers(page)).toHaveCount(2);

  // 12–14: back side with different artwork, then back to the front
  await page.getByRole("radio", { name: /^Back/ }).click();
  await upload(page, "photo.jpg");
  await expect(page.getByText(/no transparent background/)).toBeVisible(); // honest JPG warning
  await expect(layers(page)).toHaveCount(1);
  await page.getByRole("radio", { name: /^Front/ }).click();
  await expect(layers(page)).toHaveCount(2);

  // 15–16: change shirt colour — both sides keep their designs
  await page.getByRole("radio", { name: "Navy", exact: true }).click();
  await expect(page.getByTestId("colour-name")).toHaveText("Navy");
  await expect(layers(page)).toHaveCount(2);
  await expect(page.getByRole("radio", { name: /^Back/ })).toContainText("1");
  await expect(page.getByRole("radio", { name: /^Front/ })).toContainText("2");

  // 17–19: size, quantity, live price
  const before = await orderTotal(page);
  await page.getByRole("radio", { name: "Sizes & price" }).click();
  await page.getByRole("radio", { name: "L", exact: true }).click();
  await page.getByRole("button", { name: "Increase Quantity" }).click();
  await expect(page.getByTestId("order-total")).not.toHaveText(before);
  await expect(page.getByTestId("line-total")).toHaveText(await orderTotal(page));
  await expect(layers(page)).toHaveCount(2); // size & quantity changes never touch the design

  // 20–22: add to cart; the design stays attached
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.waitForURL("**/cart");
  const line = page.getByTestId("cart-line");
  await expect(line).toHaveCount(1);
  await expect(line.getByRole("img", { name: /front with your design/ })).toBeVisible();
  await expect(line.getByRole("img", { name: /back with your design/ })).toBeVisible();
  await expect(line).toContainText("Navy");

  // 23–24: checkout and pay
  await page.getByRole("link", { name: "Checkout" }).click();
  await fillCheckout(page);
  const orderUrl = await placeAndPay(page, "success");
  await expect(page.getByText("Thank you — your order is confirmed.")).toBeVisible();
  const orderNumber = orderUrl.match(/SG-\d+/)![0];

  // 25–29: admin sees the order, the exact design, downloads artwork, changes status
  const admin = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await adminLogin(admin);
  await admin.getByRole("link", { name: "Orders", exact: true }).click();
  await admin.getByRole("link", { name: new RegExp(orderNumber) }).first().click();
  await expect(admin.getByRole("img", { name: "front design as ordered" })).toBeVisible();
  await expect(admin.getByRole("img", { name: "back design as ordered" })).toBeVisible();
  await expect(admin.getByText(/Text “JAIPUR RUNNERS” · Oswald/)).toBeVisible();
  await expect(admin.getByTestId("size-breakdown")).toContainText("L");

  const front = await download(admin, /_FRONT_DTF\.png/);
  expect(front.filename).toBe(`${orderNumber}_FRONT_DTF.png`);
  expect(fs.statSync(front.path).size).toBeGreaterThan(10_000);
  const json = await download(admin, /_DESIGN\.json/);
  const design = JSON.parse(fs.readFileSync(json.path, "utf8"));
  expect(design.design.surfaces.front.elements).toHaveLength(2);
  expect(design.colour.name).toBe("Navy");
  const original = await download(admin, /Original: logo\.png/);
  expect(original.filename).toMatch(/_ORIGINAL\.png$/);

  await admin.getByLabel("Move order to").selectOption("APPROVED");
  await admin.getByRole("button", { name: "Update status" }).click();
  await expect(admin.getByText("Moved to Approved.")).toBeVisible();
  await admin.getByLabel("Move order to").selectOption("IN_PRODUCTION");
  await admin.getByRole("button", { name: "Update status" }).click();
  await expect(admin.getByText("Moved to In production.")).toBeVisible();
  await expect(admin.getByTestId("status-history")).toContainText("Dev Admin");

  // the customer's page reflects production progress
  await page.reload();
  await expect(page.getByTestId("order-status")).toHaveText("Being printed");
});
