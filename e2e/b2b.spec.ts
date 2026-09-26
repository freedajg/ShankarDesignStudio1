import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { addText, adminLogin, download, fillCheckout, openStudio, placeAndPay, upload } from "./helpers";

/** Brief §54 — the B2B bulk acceptance scenario, end to end. */
test("B2B: polo with logo and company name, size breakdown, bulk tier, company checkout, production", async ({ page, browser }) => {
  // 1–2: polo, colour
  await openStudio(page, "/studio/pique-polo?mode=bulk");
  await page.getByRole("radio", { name: "Bottle Green", exact: true }).click();

  // 6: front print area (left chest is the polo default) — 3–5: logo, company name, position
  await expect(page.getByRole("radio", { name: /Left chest/ })).toHaveAttribute("aria-checked", "true");
  await upload(page, "logo.png");
  await page.getByRole("button", { name: "Move left 2 mm" }).click();
  await addText(page, "front", "ACME EVENTS");

  // 7: optional back design
  await page.getByRole("radio", { name: /^Back/ }).click();
  await addText(page, "back", "TEAM ACME 2026");

  // 8–11: quantity by size, total updates, bulk tier activates, price changes
  await page.getByRole("radio", { name: "Sizes & price" }).click();
  const tools = page.getByRole("complementary", { name: "Design tools" });
  const setSize = async (code: string, n: number) => tools.getByLabel(`${code} quantity`, { exact: true }).fill(String(n));
  await setSize("S", 20);
  await expect(page.getByTestId("total-quantity")).toHaveText("20 pieces");
  const at20 = await page.getByTestId("unit-price").innerText();
  await setSize("M", 35);
  await setSize("L", 30);
  await setSize("XL", 10);
  await setSize("XXL", 5);
  await expect(page.getByTestId("total-quantity")).toHaveText("100 pieces");
  await expect(tools.getByTestId("tier-badge")).toContainText("15% bulk discount");
  await expect(page.getByTestId("unit-price")).not.toHaveText(at20);

  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.waitForURL("**/cart");
  await expect(page.getByText("Bulk order", { exact: true })).toBeVisible();

  // 12–13: company details and checkout
  await page.getByRole("link", { name: "Checkout" }).click();
  await expect(page.getByRole("group", { name: "Business details" })).toBeVisible();
  await fillCheckout(page, { company: "Acme Events Pvt Ltd", gstin: "08ABCDE1234F1Z5", po: "PO-7781" });
  const orderUrl = await placeAndPay(page);
  const orderNumber = orderUrl.match(/SG-\d+/)![0];

  // 14–19: admin receives the complete order
  const admin = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await adminLogin(admin);
  await admin.goto(`/admin/orders?channel=B2B&q=${orderNumber}`);
  await admin.getByRole("link", { name: new RegExp(orderNumber) }).first().click();
  await expect(admin.getByText("Acme Events Pvt Ltd")).toBeVisible();
  await expect(admin.getByText("GSTIN 08ABCDE1234F1Z5")).toBeVisible();
  await expect(admin.getByText("PO PO-7781")).toBeVisible();
  const breakdown = admin.getByTestId("size-breakdown");
  for (const [code, n] of [["S", 20], ["M", 35], ["L", 30], ["XL", 10], ["XXL", 5]] as const) {
    const row = breakdown.getByRole("row").filter({ has: admin.getByRole("cell", { name: code, exact: true }) });
    await expect(row.getByRole("cell").nth(2)).toHaveText(String(n));
  }
  await expect(admin.getByText(/Left chest · 90 × 90 mm/)).toBeVisible();
  await expect(admin.getByText(/EMBROIDERY · 100 pcs/)).toBeVisible();
  await expect(admin.getByText(/digitised stitch file/)).toBeVisible(); // honest method note

  const pdf = await download(admin, /Job sheet PDF/);
  expect(pdf.filename).toBe(`${orderNumber}_ORDER.pdf`);
  expect(fs.readFileSync(pdf.path).subarray(0, 4).toString()).toBe("%PDF");
  const front = await download(admin, /_FRONT_EMBROIDERY\.png/);
  expect(front.filename).toBe(`${orderNumber}_FRONT_EMBROIDERY.png`);

  for (const [to, label] of [["APPROVED", "Approved"], ["IN_PRODUCTION", "In production"]] as const) {
    await admin.getByLabel("Move order to").selectOption(to);
    await admin.getByRole("button", { name: "Update status" }).click();
    await expect(admin.getByText(`Moved to ${label}.`)).toBeVisible();
  }
});
