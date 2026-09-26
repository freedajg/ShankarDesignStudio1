import { expect, test } from "@playwright/test";
import { addText, adminLogin, fillCheckout, openStudio, placeAndPay } from "./helpers";

test("admin pages and admin APIs require a staff session", async ({ page, request }) => {
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Forders/);
  await page.context().addCookies([{ name: "sg_session", value: "forged-token", url: page.url() }]);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin\/login/);
  const res = await request.get("/api/admin/orders/SG-10001/download?kind=pdf");
  expect(res.status()).toBe(401);
});

test("an order cannot be opened without its private link; failed payment keeps the order and can be retried", async ({ page, browser }) => {
  await openStudio(page, "/studio/classic-crew-tshirt");
  await addText(page, "front", "RETRY ME");
  await page.getByRole("button", { name: /Add to cart/ }).click();
  await page.waitForURL("**/cart");
  await page.getByRole("link", { name: "Checkout" }).click();
  await fillCheckout(page);
  const url = await placeAndPay(page, "failure");
  await expect(page.getByText("Payment wasn't completed.")).toBeVisible();
  await expect(page.getByRole("img", { name: /front/ })).toBeVisible(); // the design is still attached

  const number = url.match(/SG-\d+/)![0];
  const stranger = await (await browser.newContext()).newPage();
  for (const path of [`/orders/${number}`, `/orders/${number}?t=guess`]) {
    const res = await stranger.goto(path);
    expect(res?.status()).toBe(404);
  }

  // retry succeeds
  await page.getByRole("button", { name: "Try again" }).click();
  await page.waitForURL(/\/pay\/dev/);
  await page.getByRole("button", { name: "Simulate successful payment" }).click();
  await page.waitForURL(/\/orders\//);
  await expect(page.getByText("Thank you — your order is confirmed.")).toBeVisible();

  // production staff can't approve designs or cancel orders
  const prod = await (await browser.newContext()).newPage();
  await adminLogin(prod, "production");
  await prod.goto(`/admin/orders/${number}`);
  await expect(prod.getByText("No further status changes available.")).toBeVisible();
});

test("the checkout API ignores client-side prices", async ({ page, request }) => {
  await openStudio(page, "/studio/classic-crew-tshirt");
  await addText(page, "front", "PRICE");
  const total = await page.getByTestId("order-total").innerText();
  const res = await page.request.post("/api/cart/items", {
    data: { designVersionId: "00000000-0000-0000-0000-000000000000", channel: "B2C", printMethodCode: "DTF", sizes: [], unitPricePaise: 1 },
  });
  expect(res.status()).toBe(400);
  expect(total).toMatch(/₹/);
  const cross = await request.post("/api/checkout", { data: { form: {} }, headers: { Origin: "https://evil.example" } });
  expect(cross.status()).toBe(403);
});
