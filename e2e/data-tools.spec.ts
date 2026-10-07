import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function createAccount(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.goto("/accounts");
  await page.getByLabel("Account name").fill(name);
  await page.getByLabel("Opening date").fill("2020-01-01");
  await page.getByLabel("Opening balance (NPR)").fill("1000");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Account created with one opening entry."),
  ).toBeVisible();
}

test("exports JSON/CSV and restores the full backup after explicit confirmation", async ({
  page,
}) => {
  await createAccount(page, "Backup Bank");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("button", { name: "Expense" }).click();
  const entry = page.getByRole("dialog", { name: "New expense" });
  await entry.getByLabel("Amount (NPR)").fill("25");
  await entry
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: "Backup Bank" });
  await entry
    .getByRole("combobox", { name: "Category" })
    .selectOption({ label: "Food" });
  await entry.getByLabel("Remark (optional)").fill("Backup test");
  await entry.getByRole("button", { name: "Save", exact: true }).click();
  await expect(entry).toBeHidden();

  await page.goto("/settings");
  const [jsonDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export full JSON backup" }).click(),
  ]);
  expect(jsonDownload.suggestedFilename()).toMatch(
    /^my-finance-backup-.*\.json$/,
  );
  const jsonPath = await jsonDownload.path();
  expect(jsonPath).toBeTruthy();
  const backup = JSON.parse(await readFile(jsonPath!, "utf8"));
  expect(backup.format).toBe("my-finance-json-backup");
  expect(backup.data.transactions).toHaveLength(2);

  const [csvDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export transactions CSV" }).click(),
  ]);
  expect(csvDownload.suggestedFilename()).toMatch(
    /^my-finance-transactions-.*\.csv$/,
  );
  const csv = await readFile((await csvDownload.path())!, "utf8");
  expect(csv).toContain("Backup test");

  page.once("dialog", (dialog) => void dialog.accept());
  await page.goto("/transactions");
  await page
    .locator("article")
    .filter({ hasText: "Backup test" })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText("Backup test")).toBeHidden();

  await page.goto("/settings");
  await page.locator('input[type="file"]').setInputFiles(jsonPath!);
  await expect(page.getByText("Restore preview")).toBeVisible();
  await page.getByLabel(/Type REPLACE_ALL_DATA/).fill("REPLACE_ALL_DATA");
  await page.getByRole("button", { name: "Replace all local data" }).click();
  await expect(
    page.getByText("Backup restored. Existing local data was replaced."),
  ).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByText("Backup test")).toBeVisible();
});

test("imports a reviewed CSV only after mapping, preview and commit", async ({
  page,
}) => {
  await createAccount(page, "Import Bank");
  await page.goto("/import");
  await expect(page.getByText("PDF import — Under construction")).toBeVisible();
  const csv = [
    "Date,Description,Debit,Credit,Reference,Balance",
    "2026-10-02,Grocery,12.50,,R1,87.50",
    "2026-10-03,Salary,,100,R2,187.50",
  ].join("\n");
  await page.locator('input[type="file"]').setInputFiles({
    name: "bank.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Stage rows for review" }).click();
  await page
    .getByLabel("Statement account")
    .selectOption({ label: "Import Bank (NPR)" });
  await page
    .locator("article")
    .filter({ hasText: "source row 2" })
    .getByLabel("Category")
    .selectOption({ label: "Food" });
  await page
    .locator("article")
    .filter({ hasText: "source row 3" })
    .getByLabel("Category")
    .selectOption({ label: "Salary" });
  await page
    .getByRole("button", { name: "Check preview and duplicates" })
    .click();
  await expect(page.getByText(/Ready to confirm\? Import Bank/)).toBeVisible();
  await page
    .getByRole("button", { name: "Commit selected rows atomically" })
    .click();
  await expect(page.getByText("Import complete")).toBeVisible();
  await expect(
    page.getByText("2 imported; 0 skipped; 0 failed."),
  ).toBeVisible();
  await page.goto("/transactions");
  await expect(page.getByText("Grocery")).toBeVisible();
  await expect(page.getByText("Salary · Import Bank")).toBeVisible();
});
