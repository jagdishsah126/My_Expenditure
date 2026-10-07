import { expect, test } from "@playwright/test";

test("records expense, income and transfer without changing total through transfer", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByLabel("Account name").fill("Cash");
  await page.getByLabel("Opening balance (NPR)").fill("2000");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByText("Account created with one opening entry."),
  ).toBeVisible();

  await page.getByLabel("Account name").fill("eSewa");
  await page
    .locator("select")
    .first()
    .selectOption({ label: "Digital Wallet" });
  await page.getByLabel("Opening balance (NPR)").fill("3500");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(
    page.getByRole("button", { name: /eSewa Rs 3,500/ }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("button", { name: "Expense" }).click();
  const expenseDialog = page.getByRole("dialog", { name: "New expense" });
  await expenseDialog.getByLabel("Amount (NPR)").fill("180");
  await expenseDialog
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: "eSewa" });
  await expenseDialog
    .getByRole("combobox", { name: "Category" })
    .selectOption({ label: "Food" });
  await expenseDialog.getByLabel("Remark (optional)").fill("Momo");
  await expenseDialog
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(expenseDialog).toBeHidden();

  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("button", { name: "Income" }).click();
  const incomeDialog = page.getByRole("dialog", { name: "New income" });
  await incomeDialog.getByLabel("Amount (NPR)").fill("25000");
  await incomeDialog
    .getByRole("combobox", { name: "Account" })
    .selectOption({ label: "Cash" });
  await incomeDialog
    .getByRole("combobox", { name: "Category" })
    .selectOption({ label: "Salary" });
  await incomeDialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(incomeDialog).toBeHidden();

  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.getByRole("button", { name: "Transfer" }).click();
  const transferDialog = page.getByRole("dialog", { name: "New transfer" });
  await transferDialog.getByLabel("Amount (NPR)").fill("2000");
  await transferDialog
    .getByRole("combobox", { name: "From account" })
    .selectOption({ label: "Cash" });
  await transferDialog
    .getByRole("combobox", { name: "To account" })
    .selectOption({ label: "eSewa" });
  await transferDialog
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(transferDialog).toBeHidden();

  await page.goto("/");
  await expect(page.getByText("Total balance")).toBeVisible();
  await expect(page.getByText("Rs 30,320.00")).toBeVisible();
  await expect(page.getByText("Income", { exact: true })).toBeVisible();
  await expect(page.getByText("Rs 25,000.00").first()).toBeVisible();
  await expect(page.getByText("Rs 180.00").first()).toBeVisible();

  await page.goto("/graphics");
  await expect(
    page.getByRole("heading", { name: "Expense trend" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Account balances" }),
  ).toBeVisible();
  await expect(page.getByText("Food", { exact: true }).first()).toBeVisible();

  await page.goto("/transactions");
  await expect(page.getByText("Momo")).toBeVisible();
  await expect(page.getByText("Cash → eSewa")).toBeVisible();
  await page.getByLabel("Search remark, tags or name").fill("momo");
  await expect(page.getByText("Cash → eSewa")).toBeHidden();
  await expect(page.getByText("1 transaction")).toBeVisible();
});

test("confirms a carried-forward month once without changing balances", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByLabel("Account name").fill("Nabil Bank");
  await page.getByLabel("Opening date").fill("2020-01-01");
  await page.getByLabel("Opening balance (NPR)").fill("15000");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.goto("/");
  await expect(page.getByText("A new month is ready")).toBeVisible();
  await expect(page.getByText("Nabil Bank").first()).toBeVisible();
  await expect(page.getByText("Rs 15,000.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Confirm month" }).click();
  await expect(page.getByText("A new month is ready")).toBeHidden();
  await expect(page.getByText("Rs 15,000.00").first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("A new month is ready")).toBeHidden();
  await expect(page.getByText("Rs 15,000.00").first()).toBeVisible();
});

test("archives only at zero balance and records reconciliation", async ({
  page,
}) => {
  await page.goto("/accounts");
  await page.getByLabel("Account name").fill("Wallet");
  await page.getByLabel("Opening balance (NPR)").fill("500");
  await page.getByRole("button", { name: "Create account" }).click();

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(
    page.getByText("Account balance must be zero before archiving"),
  ).toBeVisible();
  await page.getByLabel("Actual balance (NPR)").fill("450");
  await page.getByLabel("Reason").fill("Statement correction");
  await page.getByRole("button", { name: "Create adjustment" }).click();
  await expect(page.getByText("Adjustment recorded.")).toBeVisible();
  await expect(page.getByText("Rs 450.00").first()).toBeVisible();
});
