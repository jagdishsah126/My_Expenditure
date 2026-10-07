import { expect, test } from "@playwright/test";

test("mobile shell navigates and a local preference survives reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your money, in your hands." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Settings" })
    .click();
  const preference = page.getByRole("checkbox", {
    name: "Reduce interface motion",
  });
  await preference.check();
  await expect(preference).toBeChecked();
  await page.reload();
  await expect(preference).toBeChecked();
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(
    page.getByRole("dialog", { name: "Add transaction" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Add transaction" }),
  ).not.toBeVisible();
});

test("manifest and cached application shell work without a network", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const manifestUrl = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestUrl).toBeTruthy();
  const manifest = await page.evaluate(
    async (url) => (await fetch(url!)).json(),
    manifestUrl,
  );
  expect(manifest.name).toBe("My Finance");
  expect(manifest.icons).toHaveLength(2);
  for (const icon of manifest.icons) {
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  }
  const devtools = await context.newCDPSession(page);
  const { installabilityErrors } = await devtools.send(
    "Page.getInstallabilityErrors",
  );
  expect(installabilityErrors).toEqual([]);

  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Settings" })
    .click();
  await page.getByRole("checkbox", { name: "Reduce interface motion" }).check();
  await expect(
    page.getByRole("checkbox", { name: "Reduce interface motion" }),
  ).toBeChecked();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Home" })
    .click();
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Your money, in your hands." }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Graphics" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Graphics", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Mobile navigation" })
    .getByRole("link", { name: "Settings" })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Reduce interface motion" }),
  ).toBeChecked();
  await context.setOffline(false);
});

test("360px layout fits without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto("/");
  await expect(
    page
      .getByRole("navigation", { name: "Mobile navigation" })
      .getByRole("link"),
  ).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
