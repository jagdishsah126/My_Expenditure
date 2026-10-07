# My Finance — `plan.md`

> **Project:** My Finance  
> **Type:** Mobile-focused Personal Finance PWA  
> **Primary platform:** Browser + installable PWA  
> **Architecture:** Offline-first / local-first  
> **Data entry:** Manual first, statement import as an additional feature  
> **Currency:** NPR by default  
> **Status:** Architecture & Product Plan  
> **Last Updated:** 2026-10-07

---

# 1. Vision

**My Finance** is a personal finance application designed primarily for mobile browsers and PWA installation.

It should let me track:

- Cash
- Multiple bank accounts
- Multiple eSewa accounts
- Multiple Khalti accounts
- Other wallets
- Investment/trading accounts
- Income
- Expenses
- Transfers
- Categories
- Remarks
- Monthly financial activity

The app is **not** intended to connect directly to banks or wallets in V1.

The normal workflow is:

```text
Set up accounts once
        ↓
Confirm monthly balances
        ↓
Manually record transactions
        ↓
See updated balances
        ↓
Analyze spending
        ↓
Reconcile when necessary
```

Statement import is an additional convenience for importing historical or existing transaction data.

---

# 2. Most Important Monthly Behavior

## Do NOT ask for every balance again every month

This is a locked requirement.

When a new month starts, the application should already know the previous month's closing balances.

Example:

### September closing

```text
Cash       Rs 2,000
Nabil      Rs 15,000
eSewa      Rs 3,500
Khalti     Rs 800
```

When October begins, the app should simply show:

```text
Start October?

Previous balances will be carried forward:

Cash       Rs 2,000
Nabil      Rs 15,000
eSewa      Rs 3,500
Khalti     Rs 800

[Confirm]
[Review / Edit]
```

The normal action is only:

**Confirm**

The user should NOT have to re-enter all balances.

---

## 2.1 Optional Balance Update

If the user knows that an account's real balance differs from the app's calculated balance, they can update it.

Example:

```text
eSewa

App balance:
Rs 3,500

Actual balance:
Rs 3,450

[Update Balance]
```

The application should not force this every month.

---

# 3. Monthly Flow

## New Month

When the user first opens the app in a new month:

```text
October 2026

Your previous balances are ready.

Cash       Rs 2,000
Nabil      Rs 15,000
eSewa      Rs 3,500
Khalti     Rs 800

[Confirm October]
```

After confirmation, the month becomes active.

---

## If there are new accounts

If the user created a new account:

```text
New Account Detected

NMB Bank
Starting balance:
[ Rs ______ ]

[Add]
```

Only the new account requires a balance.

Existing accounts continue automatically.

---

## If an account is no longer used

The user can archive it.

Archived accounts:

- Keep historical transactions
- Keep historical balances
- Do not appear in normal active-account lists
- Can be restored later

---

# 4. Technology Recommendation

The application should remain a **browser-based PWA**.

Recommended stack:

## Frontend

```text
React
TypeScript
Vite
Tailwind CSS
```

### Why

- Excellent for interactive forms
- Strong ecosystem
- Easy PWA deployment
- TypeScript reduces financial-data bugs
- Vite provides fast development
- React works well for mobile-focused interfaces

---

# 5. PWA

Use:

```text
vite-plugin-pwa
Workbox
Web App Manifest
Service Worker
```

Requirements:

- Installable from browser
- Offline launch
- Offline transaction entry
- Offline dashboard
- Offline charts
- Offline search
- App-like mobile UI
- Cached application assets

The app must remain functional without an internet connection after installation.

---

# 6. Local Database

Use:

```text
IndexedDB
+
Dexie.js
```

Dexie should provide the application database layer.

Do NOT use only `localStorage`.

Financial records can become large enough that IndexedDB is the appropriate storage layer.

---

# 7. State Management

Use:

```text
Zustand
```

Use Zustand for:

- Current selected month
- UI state
- Filters
- Modal state
- Theme
- Temporary form state
- User preferences

Do not put the entire database inside Zustand.

Database data should remain in IndexedDB/Dexie.

---

# 8. Charts

Use:

```text
Recharts
```

Charts must work offline because the chart library is bundled with the application.

---

# 9. Statement Import

Statement import should support external financial files without requiring live bank/wallet connections.

Possible input formats:

```text
CSV
XLSX
JSON
PDF
```

Recommended libraries:

```text
PapaParse
SheetJS
PDF.js
```

However, PDF statement parsing should be treated as a separate parser because bank PDFs can have wildly different layouts.

Do NOT assume that one PDF parser will correctly understand every bank.

---

# 10. Statement Import Philosophy

Import should never blindly modify the database.

The flow should be:

```text
Select Statement
        ↓
Detect format
        ↓
Parse transactions
        ↓
Show Preview
        ↓
Map Columns / Fields
        ↓
Detect Possible Duplicates
        ↓
User Confirms
        ↓
Import
```

---

# 11. Statement Import Preview

Example:

```text
Import Preview

Found 42 transactions

Date         Description       Amount      Type

01 Oct       Salary            +25,000     Income
02 Oct       Grocery            -1,250     Expense
03 Oct       Transfer           -2,000     Transfer

[Cancel]
[Import Selected]
```

The user must be able to edit or exclude rows before importing.

---

# 12. Account Mapping During Import

The user should select which account the statement belongs to.

Example:

```text
Statement Account

Nabil Bank
[Select Account ▼]
```

If it is a new account:

```text
[Create New Account]
```

---

# 13. Category Mapping During Import

Imported transactions may not have useful categories.

Example:

```text
Grocery Store
```

The app can suggest:

```text
Food
```

But automatic categorization should be optional.

The user can manually map categories.

Example:

```text
Grocery Store → Food
Netflix → Entertainment
Daraz → Shopping
```

Mappings can be remembered for future imports.

---

# 14. Duplicate Detection

This is important.

The same transaction might exist in:

- Manual records
- Bank statement
- eSewa statement

The app should detect likely duplicates using:

```text
Date
Amount
Account
Description
Transaction type
```

Example:

```text
Possible duplicate

Rs 250
07 Oct
eSewa
"Momo"

Existing transaction found.

[Keep Both]
[Skip Import]
```

Never automatically delete an existing transaction.

---

# 15. Manual Transaction Entry

Manual entry remains the primary workflow.

Press:

```text
+
```

Then choose:

```text
Expense
Income
Transfer
```

---

# 16. Expense

Required:

```text
Amount
Account
Category
Date
```

Optional:

```text
Subcategory
Remark
Tags
Time
```

Example:

```text
Expense

Rs 180

Account:
eSewa

Category:
Food

Remark:
Momo

[Save]
```

---

# 17. Income

Required:

```text
Amount
Account
Category
Date
```

Optional:

```text
Remark
Tags
Time
```

---

# 18. Transfer

Transfers are not expenses.

Example:

```text
Transfer

Rs 2,000

From:
Nabil Bank

To:
eSewa

Remark:
Wallet top-up
```

Result:

```text
Nabil    -2,000
eSewa    +2,000
```

Total money remains unchanged.

---

# 19. Accounts

Unlimited user-created accounts.

Default account types:

```text
Cash
Bank
Digital Wallet
Investment
Other
```

Example:

```text
Cash
Nabil Bank
NIC Asia
Global IME
eSewa Personal
eSewa Secondary
Khalti
Trading Account
```

The user controls account names.

---

# 20. Account Fields

```text
id
name
type
icon
notes
currency
isActive
createdAt
updatedAt
```

---

# 21. Categories

Categories must be fully customizable.

Users can:

- Create
- Edit
- Archive
- Restore
- Reorder
- Add subcategories
- Choose icon

Category types:

```text
Expense
Income
Both
```

---

# 22. Default Expense Categories

```text
Food
    Lunch
    Dinner
    Snacks
    Restaurant

Transportation
    Bus
    Taxi
    Fuel

Education
    College
    Books
    Stationery

Bills
    Internet
    Electricity
    Water
    Phone

Shopping

Technology
    Software
    Hosting
    Domain

Entertainment

Health

Family

Travel

Personal

Investment

Other
```

---

# 23. Default Income Categories

```text
Salary
Allowance
Freelance
Business
Trading
Gift
Refund
Interest
Other
```

---

# 24. Dashboard

The Home screen should answer:

> How much money do I have right now?

```text
TOTAL BALANCE

Rs 45,820
```

Then:

```text
This Month

Income       Rs 25,000
Expenses      Rs 8,450
Net          Rs 16,550
```

Then:

```text
Accounts

Cash             Rs 2,000
Nabil Bank       Rs 20,000
NIC Asia          Rs 8,000
eSewa             Rs 3,300
Khalti              Rs 800
```

Then recent transactions.

---

# 25. Graphics / Analytics Tab

The application must have a dedicated:

```text
Graphics
```

tab.

This tab is for visual financial analysis.

---

# 26. Date Range Selector

Graphics should support:

```text
This Month
Last Month
This Year
Last 3 Months
Last 6 Months
Custom Range
```

Custom range:

```text
From:
01 Aug 2026

To:
07 Oct 2026
```

All charts should update according to the selected period.

---

# 27. Graphics to Include

## Expense Trend

Line chart showing spending over time.

Possible grouping:

```text
Daily
Weekly
Monthly
```

---

## Income vs Expense

Bar or line chart:

```text
Income
Expense
```

For example:

```text
July
August
September
October
```

---

## Expense by Category

Bar chart or pie chart.

Example:

```text
Food             Rs 2,850
Transportation   Rs 1,400
Education        Rs 1,000
Technology       Rs 1,200
Other            Rs 2,000
```

---

## Account Balance

Show balance of each account.

Example:

```text
Cash
Nabil
NIC Asia
eSewa
Khalti
```

---

## Daily Spending

Show how much was spent each day during the selected range.

Useful for identifying unusually expensive days.

---

## Income Sources

Show income grouped by category.

Example:

```text
Allowance
Freelance
Trading
Gift
Other
```

---

## Spending by Account

Show where spending happened.

Example:

```text
eSewa       Rs 3,200
Cash        Rs 2,100
Nabil       Rs 1,800
Khalti        Rs 900
```

---

# 28. Graphics Design Rule

Charts should answer a question.

Do not create charts just because chart libraries exist.

Every chart should have:

```text
Title
Date range
Useful labels
Tooltip
```

Avoid a dashboard containing 14 tiny charts that require a microscope and a prayer.

---

# 29. Transactions

Transaction fields:

```text
id
type
amount
date
time
accountId
categoryId
subcategoryId
remark
tags[]
transferId?
fromAccountId?
toAccountId?
source?
sourceReference?
createdAt
updatedAt
```

---

# 30. Transaction Source

Add a source field.

Possible values:

```text
manual
bank_statement
wallet_statement
imported
```

This allows the user to know where a transaction came from.

---

# 31. Remarks

Remarks are optional but searchable.

Examples:

```text
Lunch with friends
College stationery
Domain renewal
Mother sent money
Wallet top-up
Bus to Pokhara
```

---

# 32. Tags

Optional.

Examples:

```text
#college
#family
#project
#travel
#friends
```

---

# 33. Monthly Balance Model

The application should use a continuous balance model.

The user does not create a completely independent financial world every month.

Instead:

```text
Month N closing balance
        ↓
Month N+1 opening balance
        ↓
Confirm
```

---

# 34. Monthly Confirmation

When entering a new month:

```text
New month detected

Your account balances are ready.

5 accounts found.

[Confirm Month]
```

If the user clicks Confirm:

```text
All previous balances carried forward.
```

No manual re-entry.

---

# 35. Balance Correction

If a balance is wrong:

```text
Account → Reconcile Balance
```

Example:

```text
eSewa

Calculated:
Rs 3,500

Actual:
Rs 3,450

Difference:
-Rs 50

[Save Adjustment]
```

The adjustment should be recorded as a proper transaction or reconciliation entry.

Do not silently rewrite history.

---

# 36. Reconciliation

Users can reconcile an account whenever they want.

```text
Account Balance

Calculated:
Rs 12,450

Actual:
Rs 12,300

Difference:
-Rs 150

Reason:
[Cash withdrawal not recorded]

[Create Adjustment]
```

This is optional.

The app should not force reconciliation every month.

---

# 37. Search & Filters

Transaction search should support:

- Remark
- Account
- Category
- Tags
- Date
- Amount
- Transaction type
- Source

---

# 38. Export

The user must be able to export data.

## JSON

Complete application backup.

Contains:

- Accounts
- Categories
- Transactions
- Monthly records
- Settings
- Tags
- Import mappings

---

## CSV

Transaction export.

Useful for:

- Excel
- Google Sheets
- Analysis
- External backup

---

# 39. Import

Support:

```text
JSON backup
CSV transactions
XLSX transactions
Bank statements
Wallet statements
```

Import must always show a preview before changing the database.

---

# 40. Backup Philosophy

Financial data is important.

The application should make backup obvious:

```text
Settings
→ Backup & Restore
```

Also show:

```text
Last backup:
Never
```

if the user has never exported data.

Do not silently upload financial information anywhere.

---

# 41. Privacy

V1 should be local-first.

No account registration should be required.

No financial data should be sent to a server by default.

No analytics service should receive transaction data.

If cloud backup is introduced later, it must be an explicit opt-in feature.

---

# 42. Security

At minimum:

- No secrets in frontend code
- Validate imported files
- Sanitize imported text
- Validate transaction amounts
- Prevent invalid negative/NaN values
- Protect against malformed import files
- Do not execute imported HTML/JS
- Do not trust statement file contents

---

# 43. Mobile-First UI

The application is primarily designed for phones.

Target:

```text
360px+
```

Design priorities:

1. One-handed use
2. Large touch targets
3. Fast transaction entry
4. Minimal typing
5. Bottom navigation
6. Clear balance visibility
7. Responsive charts

Desktop should still work, but mobile comes first.

---

# 44. Recommended Navigation

```text
Home
Transactions
Graphics
Accounts
Settings
```

And a floating/add button:

```text
+
```

for:

```text
Expense
Income
Transfer
```

---

# 45. Suggested Project Structure

```text
src/
├── app/
│   ├── routes/
│   ├── providers/
│   └── app.tsx
│
├── components/
│   ├── ui/
│   ├── forms/
│   ├── charts/
│   └── transactions/
│
├── features/
│   ├── accounts/
│   ├── categories/
│   ├── transactions/
│   ├── monthly/
│   ├── graphics/
│   ├── import/
│   └── backup/
│
├── db/
│   ├── database.ts
│   ├── schema.ts
│   └── migrations/
│
├── stores/
│
├── utils/
│   ├── balance.ts
│   ├── dates.ts
│   ├── currency.ts
│   └── validation.ts
│
├── types/
│
└── main.tsx
```

---

# 46. Database Tables

Suggested Dexie tables:

```text
accounts
categories
transactions
tags
monthlySnapshots
importMappings
settings
```

Potential future tables:

```text
budgets
recurringTransactions
reconciliationEntries
```

---

# 47. Balance Calculation

For an account:

```text
Current Balance
=
Opening Balance
+ Income
+ Incoming Transfers
- Expenses
- Outgoing Transfers
+ Adjustments
```

The balance should always be explainable from the transaction history.

---

# 48. Important Transaction Rule

A transfer between two of the user's accounts must never count as:

```text
Income
```

or:

```text
Expense
```

It only changes where the money is stored.

This rule must be enforced in the data model, calculations, reports, and charts.

---

# 49. Statement Import Architecture

Create a parser abstraction.

```text
StatementParser
    ↓
CSVParser
XLSXParser
PDFParser
BankSpecificParser
WalletSpecificParser
```

Each parser converts external data into a common internal format:

```text
ImportedTransaction
```

Example:

```text
{
    date,
    description,
    amount,
    type,
    reference,
    balance
}
```

Then the application maps it to the user's:

```text
Transaction
```

---

# 50. Import Mapping

Different institutions may provide different column names.

Example:

```text
Transaction Date
Value Date
Description
Debit
Credit
Balance
```

The importer should let the user map:

```text
Date       → Transaction Date
Description → Description
Debit      → Amount
Credit     → Amount
Balance    → Balance
```

Mappings can be saved for future imports.

---

# 51. Statement Balance Handling

If a statement includes running balance, use it for validation.

Example:

```text
Statement ending balance:
Rs 25,400

Imported calculated balance:
Rs 25,400

Status:
✓ Matched
```

If it does not match:

```text
Statement ending balance:
Rs 25,400

Calculated:
Rs 25,100

Difference:
Rs 300

⚠ Review required
```

Never silently force the balance to match.

---

# 52. Error Handling

Import errors should be understandable.

Examples:

```text
Could not identify transaction date.

Amount is invalid.

Duplicate transaction detected.

Unsupported statement format.

Could not determine debit/credit column.
```

The user should be able to skip problematic rows and continue importing valid ones.

---

# 53. V1 Scope

## Must Have

- [x] PWA
- [x] Offline functionality
- [x] Mobile-first UI
- [x] Multiple accounts
- [x] Custom account types
- [x] Custom categories
- [x] Income
- [x] Expense
- [x] Transfer
- [x] Remarks
- [x] Tags
- [x] Monthly balance carry-forward
- [x] Monthly confirmation
- [x] Optional balance editing
- [x] Transaction history
- [x] Search
- [x] Filters
- [x] Graphics tab
- [x] Month analysis
- [x] Custom date-range analysis
- [x] JSON export/import
- [x] CSV export
- [x] CSV import
- [x] XLSX import
- [x] Statement import framework
- [x] Duplicate detection
- [x] Import preview
- [x] Reconciliation
- [x] Local storage

---

# 54. V1.1

After the core system is stable:

- Better PDF statement parsing
- More bank-specific statement parsers
- More wallet-specific parsers
- Saved statement mappings
- Better category suggestions
- Recurring transactions
- Budget system
- More advanced charts
- Improved reconciliation
- Better import duplicate detection

---

# 55. V2 Possibilities

Only after V1 proves useful:

- Optional encrypted cloud backup
- Multi-device sync
- Advanced budgeting
- Financial goals
- Investment portfolio tracking
- NEPSE integration
- Advanced analytics
- Automated category rules
- Optional notification reminders

---

# 56. Development Order

## Phase 1 — Foundation

1. Vite
2. React
3. TypeScript
4. Tailwind
5. PWA configuration
6. Dexie
7. Database schema
8. Routing
9. Mobile layout

---

## Phase 2 — Accounts

1. Account CRUD
2. Account types
3. Account archive
4. Balance calculation
5. Account details

---

## Phase 3 — Categories

1. Default categories
2. Custom categories
3. Subcategories
4. Category archive
5. Category management UI

---

## Phase 4 — Transactions

1. Expense
2. Income
3. Transfer
4. Transaction list
5. Transaction details
6. Edit
7. Delete
8. Search
9. Filters

---

## Phase 5 — Monthly System

1. Month detection
2. Carry-forward balances
3. Confirmation screen
4. Optional balance correction
5. Monthly summaries
6. Reconciliation

---

## Phase 6 — Dashboard

1. Total balance
2. Income
3. Expenses
4. Net change
5. Account summary
6. Recent transactions

---

## Phase 7 — Graphics

1. Graphics tab
2. Date-range selector
3. Expense trend
4. Income vs expense
5. Category breakdown
6. Account spending
7. Daily spending
8. Income source analysis

---

## Phase 8 — Backup

1. JSON export
2. JSON import
3. CSV export
4. CSV import
5. Validation
6. Import preview

---

## Phase 9 — Statement Import

1. Common imported transaction format
2. CSV parser
3. XLSX parser
4. Column mapping
5. Duplicate detection
6. Import preview
7. Saved mappings
8. PDF parser foundation
9. Bank/wallet-specific parsers

---

## Phase 10 — PWA Polish

1. Offline testing
2. Install testing
3. Service-worker update handling
4. Mobile performance
5. Error handling
6. Accessibility
7. Empty states
8. Loading states
9. Data migration testing
10. Backup/restore testing

---

# 57. Performance Requirements

The app should feel instant for normal personal usage.

Target:

```text
Initial load:
Fast on mobile

Transaction save:
Immediate UI response

Search:
Instant for normal dataset

Dashboard:
Instant for normal dataset

Charts:
Responsive for several years of personal transactions
```

Do not prematurely build a complicated backend.

A personal finance database is usually small enough for IndexedDB to handle comfortably.

---

# 58. Deployment

Recommended:

```text
GitHub
    ↓
Vercel
    ↓
HTTPS
    ↓
Installable PWA
```

The application must work both as:

```text
https://my-finance.example.com
```

and:

```text
Installed PWA
```

---

# 59. Final Technology Stack

```text
Frontend:
React + TypeScript

Build:
Vite

Styling:
Tailwind CSS

PWA:
vite-plugin-pwa + Workbox

Database:
IndexedDB

Database wrapper:
Dexie.js

State:
Zustand

Charts:
Recharts

CSV:
PapaParse

XLSX:
SheetJS

PDF:
PDF.js

Validation:
Zod

Deployment:
Vercel
```

---

# 60. Architecture Summary

```text
                    ┌──────────────────────┐
                    │      My Finance      │
                    │     React + Vite     │
                    └──────────┬───────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
          UI / Forms        Graphics         Import
              │                │                │
              │             Recharts       CSV/XLSX/PDF
              │                │                │
              └────────────────┼────────────────┘
                               │
                            Zustand
                               │
                             Dexie
                               │
                         IndexedDB
                               │
                    ┌──────────┴──────────┐
                    │                     │
                 Offline              Local Data
```

---

# 61. Product Rule

The application should always prioritize:

```text
Reliability
    >
Simplicity
    >
Speed
    >
Fancy Features
```

A finance application that looks beautiful but loses a transaction is useless.

A simple application that accurately tells me:

> "You have Rs 27,430 across your accounts."

is already doing its job.

---

# 62. V1 Success Criteria

V1 is successful when I can:

1. Open the app offline.
2. See my total money.
3. See money in each account.
4. Start a new month with one confirmation.
5. Avoid re-entering existing balances every month.
6. Add a new account when needed.
7. Record an expense in seconds.
8. Record income in seconds.
9. Transfer money between accounts.
10. Create my own categories.
11. Search my financial history.
12. Analyze a month visually.
13. Analyze any custom date range.
14. Import a statement.
15. Preview imported transactions.
16. Detect possible duplicates.
17. Export a complete backup.
18. Restore that backup.
19. Reconcile an account when the real balance differs.
20. Use the application without internet.

---

# 63. Final Product Definition

**My Finance is a mobile-first, offline-first personal finance PWA that keeps track of manually entered money movements across multiple accounts, automatically carries balances from month to month with confirmation instead of repetitive data entry, supports custom categories and remarks, provides visual financial analysis for monthly or custom periods, and allows safe import/export of financial data and statements.**

The first priority is not automation.

The first priority is **accurate personal money tracking that is fast enough to use every day.**
