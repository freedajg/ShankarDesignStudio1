import { expect, type Page } from "@playwright/test";

export const fixture = (name: string) => `e2e/fixtures/${name}`;

export async function openStudio(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByTestId("design-stage")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
}

export async function addText(page: Page, side: "front" | "back", text: string) {
  await page.getByLabel(`Add text to the ${side}`).fill(text);
  await page.getByRole("button", { name: "Add text" }).click();
  await expect(page.getByTestId("text-inspector")).toBeVisible();
}

export async function upload(page: Page, file: string) {
  await page.getByTestId("upload-input").setInputFiles(fixture(file));
  await expect(page.getByTestId("image-inspector")).toBeVisible({ timeout: 30_000 });
}

/** Layers panel entries for the current side (desktop left rail). */
export function layers(page: Page) {
  return page.getByRole("list", { name: /Layers on the/ }).locator("li");
}

export async function orderTotal(page: Page) {
  return (await page.getByTestId("order-total").innerText()).trim();
}

export async function fillCheckout(page: Page, extra: { company?: string; gstin?: string; po?: string } = {}) {
  await page.getByLabel("Full name").fill("Asha Mehta");
  await page.getByLabel("Email").fill("asha@example.com");
  await page.getByLabel("Mobile number").fill("98290 12345");
  if (extra.company) await page.getByLabel("Company name").fill(extra.company);
  if (extra.gstin) await page.getByLabel(/GSTIN/).fill(extra.gstin);
  if (extra.po) await page.getByLabel(/PO \/ reference/).fill(extra.po);
  await page.getByLabel("Address", { exact: true }).fill("12 MI Road");
  await page.getByLabel("City").fill("Jaipur");
  await page.getByLabel("State").selectOption("Rajasthan");
  await page.getByLabel("PIN code").fill("302001");
}

/** Places the order and completes the development payment; returns the order URL. */
export async function placeAndPay(page: Page, outcome: "success" | "failure" = "success") {
  await page.getByRole("button", { name: /Place order/ }).click();
  await page.waitForURL(/\/pay\/dev/);
  await expect(page.getByText("No money moves.")).toBeVisible();
  await page.getByRole("button", { name: outcome === "success" ? "Simulate successful payment" : "Simulate failed payment" }).click();
  await page.waitForURL(/\/orders\/SG-\d+\?t=/);
  return page.url();
}

export async function adminLogin(page: Page, who: "admin" | "production" = "admin") {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(`${who}@studio.local`);
  await page.getByLabel("Password").fill(`${who}-dev-password`);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin$/);
}

export async function download(page: Page, name: RegExp) {
  const [d] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name }).first().click()]);
  const path = await d.path();
  return { filename: d.suggestedFilename(), path };
}
