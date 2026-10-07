# My Finance user guide

This guide explains every tab in the app, what each feature does, how to use it, and what you can customize.

My Finance is a **mobile-first, offline-first, local-first personal finance PWA**. Your financial data stays in this browser's IndexedDB database. There is no login, cloud sync, bank connection, analytics service, or automatic upload.

> **Important:** Browser site data can be deleted or evicted. Export a JSON backup regularly from **Settings → Backup & restore**.

---

## 1. Main tabs

The mobile bottom navigation has five tabs:

```text
Home
Transactions
Graphics
Accounts
Settings
```

The floating `+` button opens transaction entry.

There are also two supporting pages:

```text
Categories
Import
```

These are opened from Accounts or Settings instead of taking space in the main navigation.

---

## 2. Home tab

Home answers:

> How much money do I have right now?

### What it shows

- **Total balance** across owned NPR accounts
- Current month income
- Current month expenses
- Operating net: `income - expenses`
- Adjustments and new-account openings
- Active account balances
- Recent transactions
- Month confirmation prompt when needed
- Warnings for:
  - a confirmed month whose opening changed after a backdated edit
  - an archived account that became nonzero later

### How to use it

1. Open Home after recording transactions.
2. Check the total balance first.
3. Review this month's income and expenses.
4. Use account balances to confirm where money is stored.
5. Use recent transactions to catch mistakes quickly.

### What is intentionally excluded

Transfers are not shown as income or expenses because they only move money between your own accounts.

Example:

```text
Nabil → eSewa Rs 2,000
```

This changes account balances but does not change your total money.

---

## 3. Monthly confirmation

This is the most important monthly feature.

### What happens when a new month starts

The app calculates each existing account's balance from the transaction ledger and shows a confirmation card.

You do **not** need to enter old balances again.

Example:

```text
Start November?

Nabil Bank    Rs 15,000
Cash           Rs 2,000
eSewa          Rs 3,500

[Confirm month]
```

### How to use it

1. Open the app in the new month.
2. Review the carried-forward balances.
3. Press **Confirm month** if they look correct.
4. Use **Review / edit balances** only if something is wrong.

### What confirmation does

- Stores confirmation metadata
- Marks the month as acknowledged

### What confirmation does not do

- It does not create a new balance
- It does not create opening transactions
- It does not move money
- It does not need to be repeated on reload

### If you missed several months

The app prompts only for the current month. Older months remain calculated from history without falsely marking them confirmed.

### New accounts during a month

A new account gets one dated opening entry when created. It is shown separately as a new account starting balance; it is not mixed into the carried-forward opening balances.

---

## 4. Transactions tab

Transactions is your searchable money history.

### What it shows

Every ledger entry:

- Expenses
- Income
- Transfers
- Opening entries
- Reconciliation adjustments

Each item shows the type, date, account/category information, amount, source, remark, and tags.

### Add a transaction

1. Press the floating `+` button.
2. Choose:
   - Expense
   - Income
   - Transfer
3. Fill the required fields.
4. Save.

### Expense fields

Required:

- Amount
- Account
- Category
- Date

Optional:

- Subcategory
- Remark
- Tags
- Time

Example:

```text
Amount: Rs 180
Account: eSewa
Category: Food
Remark: Momo
```

### Income fields

Required:

- Amount
- Account
- Category
- Date

Optional:

- Remark
- Tags
- Time

Example:

```text
Amount: Rs 25,000
Account: Nabil Bank
Category: Salary
```

### Transfer fields

Required:

- Amount
- From account
- To account
- Date

Optional:

- Remark

A transfer creates one canonical record with two account effects:

```text
From account: -amount
To account:   +amount
Total money:  unchanged
```

### Search and filters

You can filter by:

- Remark, tag, account/category/type text
- Account, including either side of a transfer
- Category or subcategory
- Tag
- Transaction type
- Source
- Date range
- Amount range

### Edit a transaction

1. Open **Transactions**.
2. Find the item.
3. Press **Edit**.
4. Change the fields.
5. Save.

Expense, income, and transfer entries can be edited.

### Delete a transaction

1. Open **Transactions**.
2. Find the item.
3. Press **Delete**.
4. Confirm.

Deleting a past transaction recalculates balances and monthly reports. It may mark a confirmed month's opening as changed.

Opening entries cannot be deleted like ordinary transactions because every account needs one opening.

---

## 5. Graphics tab

Graphics answers visual questions about your money.

### Date ranges

Available ranges:

- This Month
- Last Month
- This Year
- Last 3 Months
- Last 6 Months
- Custom Range

For a custom range, choose a start and end date. The end date is inclusive in the UI.

### Charts

#### Expense trend

Question: **How is spending moving over time?**

Shows expenses grouped daily, weekly, or monthly depending on the selected range.

#### Income vs Expense

Question: **Did operating money come in or go out?**

Compares income and expenses over the selected period.

Transfers and reconciliation adjustments are excluded.

#### Expense by Category

Question: **Where did spending go?**

Groups expenses by top-level category. Subcategory spending is rolled into its parent category.

#### Account balances

Question: **How much is in each account as of the range end?**

This is an as-of-date balance chart, not a period sum.

#### Daily spending

Question: **Which days were unusually expensive?**

Shows expense totals per day.

#### Income sources

Question: **Where did income come from?**

Groups income by category.

#### Spending by account

Question: **Which accounts were used for expenses?**

Shows which account paid for expenses. Transfers are not counted.

### Customize the analysis

- Change the date range
- Use custom dates
- Compare categories
- Compare accounts
- Check chart summaries below each chart

Every chart has a text/table summary for accessibility.

---

## 6. Accounts tab

Accounts manages where your money is stored.

### Account types

Built-in types:

- Cash
- Bank
- Digital Wallet
- Investment
- Other

You can also create custom types, such as:

- Cooperative
- Card
- Family Wallet

### Create an account

1. Open **Accounts**.
2. Fill:
   - Account name
   - Type
   - Icon, optional
   - Opening date
   - Opening balance
   - Notes, optional
3. Press **Create account**.

Example:

```text
Name: eSewa Personal
Type: Digital Wallet
Icon: 🟢
Opening balance: Rs 3,500
```

### Opening balance rule

Each account gets exactly one dated opening entry.

This is not repeated monthly. If the opening is wrong later, use reconciliation rather than editing history silently.

### Change account details

You can modify:

- Name
- Type
- Icon
- Notes

Changing these does not change financial history.

### Archive an account

An account must have exactly zero current balance before archiving.

To archive an account with money:

1. Transfer the balance to another account, or
2. Reconcile it deliberately.
3. Confirm the balance is zero.
4. Archive it.

Archived accounts:

- Keep history
- Are hidden from normal active lists
- Can be restored
- Are included in totals if a backdated edit later makes them nonzero

### Restore an account

Open the archived account and press **Restore**.

---

## 7. Reconciliation

Reconciliation corrects the app when a real account balance differs from the calculated balance.

Example:

```text
Calculated: Rs 3,500
Actual:     Rs 3,450
Difference: -Rs 50
```

### How to reconcile

1. Open **Accounts**.
2. Select the account.
3. Go to **Reconcile balance**.
4. Enter:
   - Actual balance
   - Adjustment date
   - Reason
5. Press **Create adjustment**.

### What the app creates

A dated signed adjustment entry.

A negative adjustment decreases the account. A positive adjustment increases it.

### What reconciliation is not

- It is not an expense
- It is not income
- It is not a silent rewrite of history
- It is not required every month

Use it only when needed.

---

## 8. Categories page

Open from:

```text
Accounts → Manage categories, subcategories and tags
```

or:

```text
Settings → Manage categories and tags
```

### Default expense categories

The app includes categories such as:

- Food
- Transportation
- Education
- Bills
- Shopping
- Technology
- Entertainment
- Health
- Family
- Travel
- Personal
- Investment
- Other

Some include subcategories, such as Food → Lunch, Dinner, Snacks, Restaurant.

### Default income categories

The app includes:

- Salary
- Allowance
- Freelance
- Business
- Trading
- Gift
- Refund
- Interest
- Other

### Create a category

1. Open **Categories**.
2. Enter a name.
3. Choose:
   - Expense
   - Income
   - Both
4. Choose an optional icon.
5. Choose an optional parent category.
6. Save.

### Modify a category

Select a category to change:

- Name
- Type
- Icon
- Parent

If a category is already used, some destructive changes are blocked to protect history.

### Reorder categories

Use the up/down arrows beside each category.

### Archive a category

Archiving hides the category from normal selection while preserving historical transactions.

If a category has children, archiving applies to the subtree.

### Restore a category

Select an archived category and press **Restore**. Restore the parent before restoring a child.

### Delete a category

Permanent delete is available only for an unreferenced leaf category. Archive is safer for categories used by transactions.

---

## 9. Tags

Tags are optional labels such as:

```text
#college
#family
#travel
#project
```

### Create tags

Open **Categories → Tags**, enter a tag, and save.

Tags are normalized to lowercase and duplicate labels are reused.

### Use tags

Select tags when creating or editing a transaction.

### Filter by tags

Open **Transactions** and choose a tag in the Tag filter.

### Rename or delete tags

Open **Categories → Tags**.

A tag used by transactions cannot be deleted until those references are removed.

---

## 10. Import page

Open from:

```text
Settings → Import CSV/XLSX statements
```

### Supported V1 import formats

- CSV
- XLSX

PDF is shown as **Under construction** and is not read.

### Import flow

```text
Choose file
→ Detect format
→ Map columns
→ Stage rows
→ Choose account
→ Edit/skip rows
→ Check duplicates
→ Confirm
→ Atomic import
```

### Column mapping

You can map:

- Date
- Description
- Debit
- Credit
- Signed amount
- Reference
- Running balance

Use either:

- Debit + Credit, or
- one signed amount column

Do not use both modes at once.

### Date formats

Supported formats:

- `YYYY-MM-DD`
- `DD/MM/YYYY`
- `MM/DD/YYYY`
- Excel serial date, 1900 system

### Review rows

Before anything is saved, you can:

- Include or exclude a row
- Correct the date
- Correct the amount
- Choose income or expense direction
- Choose a category
- Edit description/reference
- Skip duplicates
- Explicitly keep both duplicates

### Duplicate detection

The app compares:

- Account
- Date window
- Amount
- Direction
- Description
- Reference

It also checks duplicates within the same file.

### Important transfer rule

A bank statement debit and wallet statement credit do **not** automatically prove an internal transfer.

V1 imports statement rows as income or expense only. Skip or handle transfer-like rows carefully rather than recording both sides as spending and income.

### Saved mappings

After mapping a statement format, you can save the column mapping and reuse it later.

### Import safety

- Files are parsed locally
- Nothing is uploaded
- Preview does not write to the database
- Invalid selected rows cannot be committed
- Duplicate candidates need a decision
- Final commit rechecks duplicates
- Rows are written atomically

---

## 11. Settings tab

Settings contains preferences, data tools, backup and restore.

### Display preference

You can enable **Reduce interface motion**.

This is stored locally as a preference, not financial data.

### Backup & restore

#### JSON backup

JSON is the complete backup format. It includes:

- Account types
- Accounts
- Categories
- Tags
- Transactions
- Monthly confirmations
- Import mappings
- Settings

Press **Export full JSON backup**.

The app shows `Last export initiated` because a browser cannot prove where you saved the downloaded file.

#### CSV export

CSV is for analysis in Excel, Google Sheets, or other tools.

It is not a complete backup.

#### Restore

Restore is **replace-all**, not merge.

Flow:

```text
Choose JSON backup
→ Validate
→ Preview counts and date coverage
→ Type REPLACE_ALL_DATA
→ Replace all local data
```

Invalid backups leave the current database unchanged.

### Privacy

Financial data stays local. JSON backups are plaintext sensitive files. Store them privately.

---

## 12. Recommended daily workflow

```text
Open app
→ Check total
→ Press +
→ Record expense/income/transfer
→ Review recent transactions
```

At the end of the week:

```text
Open Transactions
→ Search/filter mistakes
→ Edit or delete errors
→ Open Graphics
→ Review category and account spending
```

At the start of a month:

```text
Open app
→ Review carried balances
→ Confirm month
```

Occasionally:

```text
Compare real account balance
→ Reconcile only if needed
→ Export JSON backup
```

---

## 13. First-month testing checklist

Before trusting the app completely, test these with small or sample data:

### Account setup

- [ ] Create Cash with a known opening balance
- [ ] Create one bank account
- [ ] Create one wallet account
- [ ] Confirm the total equals your hand calculation
- [ ] Create a custom account type
- [ ] Add or change account icons

### Transactions

- [ ] Add an expense and verify the account decreases
- [ ] Add income and verify the account increases
- [ ] Transfer between two accounts and verify total does not change
- [ ] Add a remark and search for it
- [ ] Add a tag and filter by it
- [ ] Edit a transaction and verify balances update
- [ ] Delete a test transaction and verify balances update
- [ ] Try double-tapping Save and confirm only one record is created

### Categories and tags

- [ ] Create a custom expense category
- [ ] Create a subcategory
- [ ] Reorder categories
- [ ] Archive and restore a category
- [ ] Create, rename, and filter by a tag

### Monthly behavior

- [ ] Create an account dated in a previous month
- [ ] Open Home and confirm the carried balance is shown automatically
- [ ] Confirm the month once
- [ ] Reload and confirm the prompt does not return
- [ ] Verify no balance changed after confirmation
- [ ] Add a new account midmonth and verify it appears separately as a new account

### Reconciliation and archive

- [ ] Change an account's actual balance with a small test adjustment
- [ ] Verify the adjustment appears in history
- [ ] Verify the adjustment is not counted as expense or income
- [ ] Try archiving an account with money and confirm it is blocked
- [ ] Transfer the balance to zero and archive it
- [ ] Restore the archived account

### Graphics

- [ ] Check This Month
- [ ] Check Last Month
- [ ] Check a custom date range
- [ ] Verify expense category totals match Transactions
- [ ] Verify transfer is not shown as income or expense
- [ ] Verify account balance chart is labeled as an as-of-date view

### Backup and restore

- [ ] Export a JSON backup
- [ ] Export a CSV file
- [ ] Delete a test transaction
- [ ] Restore the JSON backup
- [ ] Confirm the deleted test transaction returns
- [ ] Confirm the app warns that JSON contains sensitive data

### Import

- [ ] Import a small CSV with two or three rows
- [ ] Check that preview appears before saving
- [ ] Edit one row before commit
- [ ] Skip one row before commit
- [ ] Confirm only selected rows import
- [ ] Import the same file again and confirm duplicate warnings appear
- [ ] Try a PDF and confirm it is not read because PDF is under construction

### Offline/PWA

- [ ] Open the app once online
- [ ] Turn off internet
- [ ] Reload the app
- [ ] Add a test transaction offline
- [ ] Turn internet back on and confirm local data remains
- [ ] Install the PWA on your phone
- [ ] Test the 360px mobile layout and bottom navigation

If any money total looks wrong, stop and compare the transaction history with your hand calculation before entering more real data.
