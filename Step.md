# My Finance — implementation steps for review

> Based on `plan.md` (2026-10-07). **Approved implementation plan.** Phase 0 decisions and worked ledger examples are recorded in `Decisions.md`. Work proceeds one phase at a time; approval of this plan does not skip phase acceptance gates.

## 1. My understanding of the product

Build a **mobile-first, installable, offline-first personal finance PWA**. One person records money held in cash, banks, eSewa/Khalti and other wallets, and investment/trading accounts. They manually add expenses, income and transfers; see reliable account and total balances; search history; review charts; and optionally import statements. Data lives in their browser's IndexedDB. V1 needs no sign-up, bank connection, backend, telemetry, or automatic cloud upload.

The most important user experience is **starting a new month with one confirmation**. Existing account balances are calculated from the prior ledger and shown automatically. The user does not type them again. New accounts get a one-time opening balance; a mismatch in an existing account is handled by an explicit, optional reconciliation entry. Monthly confirmation must not create a second balance or double-count any money.

The priority is **correctness and recoverability before polish**. A transfer changes two account balances but is neither income nor expense. Import always goes through review; no imported row or reconciliation silently rewrites existing history. JSON backup and restore must be available and understandable because clearing browser/site storage can permanently erase local data.

### What I would deliver for V1

- Responsive Home, Transactions, Graphics, Accounts, and Settings; prominent `+` action for expense/income/transfer.
- Onboarding, multiple named accounts and user-defined account types; customizable categories/subcategories; remarks and tags.
- Accurate ledger-derived balances, month confirmation/carry-forward, optional reconciliations, account archive/restore.
- Searchable/filterable transaction history, editing/deleting with confirmation, month and custom-range graphics.
- Local JSON backup/restore, CSV transaction export, reviewed CSV/XLSX transaction and statement import with duplicate warnings.
- Installable PWA whose shell, data operations, search, and bundled charts work offline after an initial online load/install.

## 2. Proposed architecture and non-negotiable rules

```text
React UI / routes / forms / charts
            │
Feature services (validation, ledger, month, import, backup)
            │
Dexie repositories + transactions → IndexedDB (source of truth)
            │
Zustand: selected month, filters, dialogs, theme only
```

- Use React + TypeScript + Vite + Tailwind; Dexie/IndexedDB; Zustand for UI state; Recharts; Zod at all data boundaries; PapaParse for CSV; an XLSX reader such as SheetJS after checking its current license/distribution; vite-plugin-pwa/Workbox. PDF import is **not implemented in V1**; show an `Under construction` box instead, without reading/uploading a PDF. PDF.js and parser work are deferred.
- Use Dexie live queries or equivalent subscriptions to refresh UI after writes. Balance and reports are selectors over database records, not independently editable state in Zustand.
- Every financial write is validated and done in an IndexedDB transaction where multiple records must change together. Stable IDs, timestamps, schema versions, and tested migrations are required.
- Store monetary values as **integer paisa** (100 paisa = NPR 1); parse user input as decimal text, then convert exactly. Reject empty, zero/negative transaction amounts, NaN, infinities, excess decimal places, and unsafe integer overflow. A signed amount is used only for internal adjustment deltas. Format display as NPR/Rs without floating-point arithmetic.
- Keep one canonical transaction per transfer, with a source and destination account. Derive `-amount` and `+amount` for the two accounts; do **not** store two independently editable transfers. Edit/delete must update both balances atomically through the derived ledger.
- Prefer one canonical ledger for opening entries, income, expense, transfer, and reconciliation adjustments. V1 monthly records store **confirmation metadata only**; calculate monthly balances from the ledger. Introduce an invalidatable derived cache only if later performance measurements justify it. A confirmed month remains explainable from the underlying ledger.
- Use calendar dates in the approved **Asia/Kathmandu** timezone for V1. Persist date-only values as `YYYY-MM-DD`, month IDs as `YYYY-MM`; timestamps in UTC. Define month boundaries as `[month start, next month start)`; charts/search use inclusive user-facing end dates. Do not calculate month keys from UTC timestamps accidentally.
- Base V1 money totals/charts on **NPR-only accounts**. Preserve an account `currency` field, but do not sum different currencies without conversion rules and exchange-rate data. See review decisions below.
- No runtime CDN/fonts/analytics dependencies for core screens; service worker caches app assets, not private transaction payloads in an HTTP cache. HTTPS is required in production for installation.

## 3. Data model to implement before screens

| Entity | Main fields / purpose |
| --- | --- |
| `accounts` | `id`, name, `accountTypeId`, currency, icon, notes, active/archived state, created/updated timestamps. Multiple wallets or banks with the same type are separate accounts. |
| `accountTypes` | Built-ins Cash, Bank, Digital Wallet, Investment, Other; optional user-defined name/icon; referenced types cannot be destructively removed. |
| `categories` | `id`, name, type (`expense`/`income`/`both`), `parentId?`, sort order, icon, archived flag. Subcategories live in this table; prevent cycles and incompatible parent/child types. |
| `tags` | ID and normalized label for suggestion/reuse; transactions store tag IDs. |
| `transactions` | Discriminated types: `opening`, `expense`, `income`, `transfer`, `adjustment`. Common: ID, positive integer amount where applicable, date, optional time, remark, source, optional source reference, created/updated. Expense/income require account + matching category; transfer requires distinct from/to accounts; adjustment requires account + signed delta + optional reason + before/after audit values; opening requires account + opening amount. Optional subcategory/tag IDs where valid. |
| `monthlyConfirmations` | Unique month key, confirmation timestamp and a `openingChangedSinceConfirmation` flag. Do not store opening/closing amounts in V1; always derive them from transactions. |
| `importMappings` | Basic saved CSV/XLSX column mappings scoped by format/institution or user label; advanced mapping rules remain later work. |
| `settings` | App defaults, theme/preferences, timezone/currency policy, last backup-export attempt metadata, database/backup version. |

**Indexes:** dates/month ranges and account+date for ledger queries; type/category/source for filters as useful; unique IDs, month key and mapping identity. Add only indexes that support real queries. Do not delete archived accounts/categories that are referenced by historical transactions; display their names in history. Keep opening records and adjustments in backup/export even if hidden from the ordinary income/expense list.

**Balance formula for account A through a given date:** sum its opening entries + income received − expenses paid + incoming transfers − outgoing transfers + signed reconciliation adjustments. Current total = sum of owned NPR account balances; normally archived accounts are zero, but if a backdated edit makes one nonzero, **include and flag it** rather than silently removing money from the total. A monthly opening for October is the ledger balance **before October 1**; October closing is the ledger balance **before November 1**. October's monthly income/expense excludes openings, transfers and adjustments; show these separately so the total-balance equation is exact: `closing − opening = income − expense + adjustments + opening entries for accounts added during the month` (internal transfers cancel across all accounts). At the individual-account level, incoming/outgoing transfers also appear in this equation.

**Onboarding/new accounts:** create an account and an initial opening ledger entry once, dated when tracking begins; zero is an explicit valid opening balance. Creating a new account later never asks for opening balances of existing accounts. For historical imports predating an account's opening date, require an explicit date/opening correction rather than silently double-counting imported transactions.

## 4. Key user flows and edge cases

### 4.1 Onboarding and accounts

1. On first use, show privacy/offline-storage explanation and backup reminder; seed default account types/categories once (idempotently).
2. Let the user create a first account with name, type, NPR and an opening date/balance; choose icons/notes if desired. Other accounts can be added anytime.
3. Account detail shows current balance, ledger entries and Reconcile action. Rename/type changes do not change history. Archive hides an account from ordinary active pickers but keeps history and permits restore.
4. **Archive rule:** require zero balance before archiving; provide a clear transfer or reconciliation path. If a backdated edit later makes an archived account nonzero, warn, include its balance in the total and show it in a clearly labeled reconciliation view rather than silently making money disappear.

### 4.2 Manual transactions

1. `+` opens Expense / Income / Transfer. Fast defaults: today, last-used account/category when valid, numeric keypad, large buttons, minimal required inputs.
2. Expense/income require positive amount, active account, compatible active category and date; optional subcategory, remark, tags, time. A transfer requires two distinct active accounts and no income/expense category.
3. Show validation before saving; one successful submit creates one record. Duplicate taps must not create accidental duplicate saves. Edit/delete prompts show how balances will change; edits to past records recalculate dependent monthly views.
4. Search/filter by remark, tag, account (including either transfer side), category, date interval, amount interval, type and source. Historical archived accounts/categories remain findable. Pagination/virtualization can be added if dataset size warrants it.

### 4.3 Monthly confirmation (the locked requirement)

1. Detect the current calendar month on launch/resume, not just while the page stays open. Compare with recorded confirmations; show a **one-time, idempotent** current-month confirmation prompt if pending.
2. Preview each existing active account's opening balance calculated as of the prior month end. A new account created during the month has a one-time dated opening entry and is shown separately as `New account: starting balance`; it is not in the prior-month closing or this month's carried-forward opening total, even if created on day one. No existing account asks for input.
3. `Confirm Month` records only acknowledgment/confirmation metadata; **it does not add balance transactions or store a second copy of balances**. Refresh/reopen cannot create another confirmation or double the balance. `Review / Edit` links to a deliberate dated balance adjustment, not a silent overwrite.
4. Transactions dated during the new month, including those entered before confirmation if allowed, still affect current balance and monthly activity; the preview opening remains the balance at the start-of-month boundary. Historical views and data export remain accessible while confirmation is pending.
5. If the app has not been opened for several months, compute skipped months from the same continuous ledger. Prompt once for the current month, not once per missed month; mark skipped months as derived/unconfirmed rather than claiming the user confirmed them.
6. If an old transaction is edited/imported after confirmation, recompute current and affected future openings/closings from the ledger. Preserve the original confirmation timestamp; mark a confirmed month's opening as changed if a later write affects a date **before that month's start** (including deletion). Regular current-month activity does not invalidate its opening. Never let confirmation metadata override live ledger results.
7. Reconcile anytime: show calculated vs actual, reason, date, signed difference; save an adjustment entry if nonzero. For month-start edits, explicitly choose the month-boundary date and show how subsequent activity is affected. Adjustment is not income or expense.

### 4.4 Home and Graphics

- Home: total, account balances, selected/current month income, expense and net operating change, recent transactions; active/archived and adjustment labels must avoid misleading totals.
- Graphics route with This Month, Last Month, This Year, Last 3/6 Months and Custom Range; all cards update from the same selected range, including empty states.
- Implement expense trend (daily/weekly/monthly), income vs expense, expense by category, current/as-of-range-end account balances, daily spending, income sources, and spending by account. Clearly label the balance chart as an **as-of date** snapshot rather than pretending it is a period sum. Transfers and adjustments excluded from income/spending charts; optionally shown as separate explanations.
- Each chart answers a question, has title, range, units and accessible text/table summary as well as tooltip. Fit small screens without a wall of tiny charts.

### 4.5 Backup, restore and statement import

1. Settings → Backup & Restore: versioned complete JSON containing all records, settings and confirmation/import metadata. Generate a local download; display a clear `Last export initiated` timestamp (a browser cannot prove the file was saved). State plainly that an unencrypted JSON file contains sensitive financial data.
2. Restore: select file → validate full schema/version/references → preview record counts, date coverage and replacement consequences → optionally create/download a pre-restore backup → explicit confirm → atomic replacement. V1 restore is **replace-all**, not an unsafe implicit merge. Bad files leave existing data unchanged. Include migration/version handling for older supported backups.
3. CSV export for transaction analysis with documented columns, transfer from/to columns and transaction type, enough information to avoid confusing transfers with expenses. Escape fields and prevent spreadsheet formula injection in text columns. JSON is the lossless backup; CSV is not presented as one.
4. CSV/XLSX import: read files **locally** under size/row limits, parse to a common candidate-row shape with source row number and raw values; detect format and let the user select an account (or draft a new one to create on commit), sheet, date format, debit/credit or signed-amount columns, description/reference/balance. Mapping `Debit` and `Credit` to one generic amount without a direction rule is invalid.
5. Show an editable preview **before any financial database write**: valid/invalid rows, selected/excluded rows, category assignment, dates/amounts, proposed type, duplicate candidates and ending-balance comparison when meaningful. Let the user fix or skip rows; invalid uncorrected rows cannot be committed.
6. Compare possible duplicates on account, date/window, absolute amount, direction/type, normalized description and reference where present. Also check duplicates **within the same file**. Display match reasons and allow Skip / Keep Both; never delete/replace an existing entry automatically. Recheck on commit against changes since preview.
7. Imported statement lines alone do not prove an inter-account transfer: require the user to identify a counterpart and explicitly link/convert it, or classify as income/expense (or skip). Avoid recording both a bank debit and wallet credit as unrelated spending/income; matching two statement sides must not generate two transfers.
8. Commit confirmed rows and associated metadata together; report imported/skipped/failed counts and preserve row-level provenance. A statement running balance is an advisory **validation check** only, not a forced adjustment; clarify when partial imports, missing opening balance or filtered rows make the comparison inconclusive.
9. PDF in V1: show a clearly labeled **PDF import — Under construction** box in the import UI. The PDF action is disabled and does not open/read/upload files. PDF parsing, adapters and institution-specific support are deferred until a later separately approved phase.

## 5. Implementation sequence and acceptance gates

Each phase is shippable/testable internally; do not build charts/import on an unverified ledger. Tests and accessibility are ongoing, not only a final polish phase.

### Phase 0 — Agree the contracts

- Record the approved §7 decisions in `Decisions.md`; specify ledger schema, timezone/currency rules, import/backup version contract and worked examples for month boundaries, transfers and reconciliations.
- Identify XLSX licensing/distribution and candidate routing/test libraries before installing dependencies; final package selection can be checked again when Phase 7 starts.
- **Gate:** hand-calculated examples agree with the written ledger/selectors contract. There is no UI or executable implementation to compare yet; automated tests will encode these fixtures in Phases 2–4.

### Phase 1 — Foundation and offline shell

- Scaffold Vite/React/TypeScript/Tailwind, lint/format, router, mobile layout and bottom navigation; add accessible form/dialog primitives and error/empty/loading states.
- Add Dexie schema with migrations and repositories, Zod validators, seed data, UI-only Zustand store. Add Vitest + fake-indexeddb for unit/integration tests and browser E2E tooling (e.g. Playwright).
- Configure manifest/icons, Workbox asset precache and update prompt; verify production HTTPS and offline reload after first successful load. Document that the first visit requires network and storage is device/browser specific.
- **Gate:** installable shell loads offline; a database write survives refresh; schema upgrade test preserves records.

### Phase 2 — Ledger, accounts and categories

- Implement exact money/date utilities, ledger reducer/selectors, invariant tests for opening, expenses, income, transfers and adjustments.
- Account type CRUD, account CRUD/opening, archive/restore and account detail; seed defaults only once. Category CRUD, hierarchy, reorder, archive/restore, type constraints and tag suggestions.
- **Gate:** adding an account once never doubles its opening; transfer leaves total unchanged; referenced archived entities remain visible in history; zero-balance archive rule works.

### Phase 3 — Fast transactions and history

- Build expense/income/transfer forms, validation, persistence, list/detail, edit/delete, source labels, search/filters and responsive keyboard/touch behavior.
- Recalculate balances from committed ledger writes; test double-submit prevention, retroactive edit/delete and transfer edits/deletes.
- **Gate:** account balances and net worth match a hand-calculated multi-account fixture before/after all create/edit/delete actions; transfers never appear as income or expense.

### Phase 4 — Monthly flow and reconciliation

- Derive month boundaries/opening/closing; implement pending month detection, one-tap confirmation, review flow, skipped-month handling and changed-opening metadata for retroactive writes.
- Add dated balance reconciliation with difference and reason; separate adjustment display in summaries.
- **Gate:** September closing Rs 2,000 / 15,000 / 3,500 / 800 yields identical October openings after one Confirm and repeated reloads; an eSewa −Rs 50 adjustment yields Rs 3,450 and a traceable entry; backdated edits update future months without another opening entry.

### Phase 5 — Dashboard and Graphics

- Build Home totals/account rows/recent activity; implement reusable date-range selectors/aggregations and all seven graphics described in §4.4.
- Test time boundaries, grouping and empty/many-category layouts at 360px and desktop widths. Lazy-load charts if needed without using network at runtime.
- **Gate:** chart totals reconcile to the same filtered ledger as the transaction list; no transfer/adjustment is counted as ordinary income or expense.

### Phase 6 — Backup and restore (before complex import)

- Versioned JSON export and validated preview/replace restore; CSV export; backup reminder/status UI; tests for round trip and invalid file rollback.
- **Gate:** export → wipe an isolated test database → restore reproduces IDs, accounts, balances, categories, confirmations, tags/settings and historical reports; invalid restore preserves old database.

### Phase 7 — Reviewed CSV/XLSX and statement import

- Add parser interface, CSV/XLSX adapters, column mapping, normalization/validation, editable preview, duplicate engine, optional simple saved mappings, atomic import and result screen.
- Include sample bank/wallet debit-credit fixtures and failure fixtures; implement ending-balance validation with honest inconclusive states. Show a disabled `PDF import — Under construction` box, without parser code or file handling.
- **Gate:** no data changes on parse/preview/cancel/error; imported selected rows alter exactly the intended accounts; repeated import is warned; partial errors can be skipped; transfer classification is explicit.

### Phase 8 — Hardening and release

- Run offline/install/update tests in mobile browsers, check private/incognito/storage-eviction warnings, data migrations and backup/restore on representative sizes. Test keyboard/screen-reader paths, date picker, chart summaries, safe areas, touch targets and 360px layout.
- Add import file-size/resource limits; protect against malformed XLSX/CSV, HTML/JS injection, CSV formula injection and invalid numeric/date formats. PDF is not read in V1. Check no transaction data is sent to servers/analytics and no remote asset prevents offline use.
- Build/deploy on HTTPS (e.g. Vercel), validate service-worker upgrade without database loss, then run the end-to-end scenario in §6 before calling V1 complete.

## 6. End-to-end V1 review scenario

1. Install/open, disconnect network, create Cash Rs 2,000, Nabil Rs 15,000, eSewa Rs 3,500 and Khalti Rs 800; total Rs 21,300.
2. Confirm next month once; four opening amounts are already present, no four balance inputs. Confirm again/reload: total is still Rs 21,300.
3. Add NMB with one opening value; prior accounts are untouched. Create Food category, add eSewa expense Rs 180, Nabil income Rs 25,000, and Nabil → eSewa transfer Rs 2,000. The transfer changes account balances but not total/income/expense.
4. Reconcile eSewa by −Rs 50 with a reason. Verify the adjustment appears in history and is excluded from expense charts. Archive/restore an eligible account without losing historical entries.
5. Search by remark/tag; inspect the current month and custom-date Graphics, checking totals against transactions. Modify a prior-month transaction and verify affected later balances update.
6. Export JSON; import a CSV/XLSX file with valid, invalid and duplicate rows; preview, edit/skip and commit only selected rows. Restore the backup into a clean test database and verify all values. Reload offline after the PWA update path.

## 7. Approved V1 decisions

These decisions were approved by the product owner and are specified in greater detail in `Decisions.md`. If a later change affects stored ledger data, migration or backup compatibility must be assessed before implementation.

1. **Currency:** NPR only for V1 accounts and totals; account currency is recorded as `NPR`. No exchange-rate logic.
2. **Time zone:** use `Asia/Kathmandu` for dates and month boundaries; UTC for audit timestamps.
3. **Archive:** require zero current balance to archive; warn and include the balance in total if a later backdated edit makes an archived account nonzero.
4. **Monthly prompt:** after a gap, prompt for the current month only; skipped months remain derived/unconfirmed. Confirmation adds no money.
5. **Import scope:** reviewed CSV and XLSX in V1. Show a **PDF import — Under construction** placeholder only; no PDF parser, file reading or upload.
6. **Saved mappings:** basic reusable CSV/XLSX column mappings in V1; advanced institution/category rules later.
7. **Investments:** investment/trading account is cash-like in V1; holdings and market valuation later.
8. **Restore:** validated preview and explicit replace-all JSON restore; no automatic merge.
9. **Historical opening:** one dated opening ledger entry per account; older imports require a deliberate opening-date/balance correction, never a monthly opening entry.

Proceed phase by phase with the gates above. `plan.md` remains the product vision; this file records the approved execution path, not a claim that features already exist.
