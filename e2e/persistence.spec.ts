import { expect, test } from "@playwright/test";
import { addText, fixture, layers, openStudio, upload } from "./helpers";

test("colour, size and quantity changes never lose the design; refresh recovers it", async ({ page }) => {
  await openStudio(page, "/studio/oversized-tshirt");
  await addText(page, "front", "KEEP ME");
  await upload(page, "logo.png");
  await page.getByRole("radio", { name: /^Back/ }).click();
  await addText(page, "back", "BACK TOO");
  await page.getByRole("radio", { name: /^Front/ }).click();

  for (const colour of ["Olive", "Lavender", "White"]) {
    await page.getByRole("radio", { name: colour, exact: true }).click();
    await expect(layers(page)).toHaveCount(2);
  }
  await page.getByRole("radio", { name: "Sizes & price" }).click();
  for (const size of ["S", "XL", "XXL"]) await page.getByRole("radio", { name: size, exact: true }).click();
  await page.getByRole("button", { name: "Increase Quantity" }).click();
  const tools = page.getByRole("complementary", { name: "Design tools" });
  await tools.getByRole("radio", { name: /^Bulk/ }).click();
  await tools.getByRole("radio", { name: /^Single order/ }).click();
  await page.getByRole("radio", { name: "Design", exact: true }).click();
  await expect(layers(page)).toHaveCount(2);

  // autosave reaches the server and the URL now identifies the design
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
  expect(page.url()).toContain("design=");

  // refresh: the design comes back from the server, with its colour
  await page.reload();
  await expect(page.getByTestId("design-stage")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(page.getByTestId("colour-name")).toHaveText("White");
  await expect(layers(page)).toHaveCount(2);
  await page.getByRole("radio", { name: /^Back/ }).click();
  await expect(layers(page)).toHaveCount(1);
  await expect(layers(page).first()).toContainText("BACK TOO");
});

test("unsaved local changes are restored after a refresh", async ({ page, context }) => {
  await openStudio(page, "/studio/classic-crew-tshirt");
  await addText(page, "front", "FIRST");
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-state", "saved", { timeout: 20_000 });
  // go offline: the next edit can only be kept locally
  await context.setOffline(true);
  await addText(page, "front", "OFFLINE EDIT");
  await page.waitForTimeout(600); // local draft debounce
  await context.setOffline(false);
  await page.reload();
  await expect(page.getByTestId("design-stage")).toHaveAttribute("data-ready", "true", { timeout: 60_000 });
  await expect(page.getByText("We restored your unsaved changes.")).toBeVisible();
  await expect(layers(page)).toHaveCount(2);
});

test("invalid artwork is rejected with a clear message; low-resolution art gets a warning", async ({ page }) => {
  await openStudio(page, "/studio/classic-crew-tshirt");
  await page.getByTestId("upload-input").setInputFiles(fixture("not-an-image.png"));
  await expect(page.getByText("Please upload a PNG or JPG image. Other file types aren't supported yet.")).toBeVisible();
  await expect(layers(page)).toHaveCount(0);
  await upload(page, "tiny.png");
  await expect(page.getByText(/print blurry|look soft/)).toBeVisible();
  await expect(page.getByText(/The image is small/)).toBeVisible();
});
