# My Finance — Phase 0 decisions and financial contracts

> Status: **Approved product decisions recorded; Phase 0 contract.** Based on `plan.md`, approved `Step.md`, and the owner's latest clarification. This is design documentation, not an implemented feature. Begin Phase 1 only after the Phase 0 handoff.

## 1. V1 decisions

| Topic | Decision |
| --- | --- |
| Product | Local-first, offline-first single-user PWA. No sign-in, backend, bank connection, cloud sync or financial-data telemetry. |
| Money | NPR only in V1; store integer **paisa**. Currency field on accounts is `NPR`; reject another currency in V1 rather than silently summing it. |
| Calendar | **Asia/Kathmandu** for transaction dates, month boundaries and date-range presets. `YYYY-MM-DD` for calendar dates; `YYYY-MM` for months; UTC ISO timestamps for creation/updates/confirmation/export audit. |
| Accounts | User-defined account types and any number of accounts. One dated opening ledger entry per account, including an explicit zero if applicable. Investments are tracked as cash-like balances, not holdings/P&L. |
| Archive | An account must have **exactly zero current balance** to archive. Preserve history. A later backdated change that makes it nonzero raises a warning; include its signed balance in overall totals until resolved. |
| Month change | Existing accounts carry forward by calculation; confirm once, without entering balances or creating opening transactions. After multiple missed months, only the current month prompts; missed months are calculated but not falsely marked confirmed. |
| Reconciliation | Optional dated, signed ledger adjustment with reason and audit values. Never rewrite an existing balance or count the adjustment as income/expense. |
| Transfers | One atomic record with two account effects. Not income, expense, or a change in overall owned money. |
| Imports | V1: reviewed CSV/XLSX transaction/statement imports with basic saved column mappings, duplicate warnings and explicit commit. Importing historical rows before an account's opening date requires a deliberate opening-date/balance correction. |
| PDF | V1 import page shows a visible **PDF import — Under construction** box with a disabled action. No PDF parser, PDF reading or PDF upload yet. Revisit in a separately approved later phase. |
| Backup | Complete, versioned local JSON export; restore validates, previews and **replaces all data** on explicit confirmation. No merge. CSV export is for analysis, not a lossless backup. |

`plan.md` is the product vision. Where its possible PDF format / parser-foundation language conflicts with the owner's latest instruction, the explicit **under-construction placeholder only** decision above controls V1.

## 2. Ledger contract

**Only transactions create or change money.** IndexedDB/Dexie holds authoritative records. Zustand holds UI state only. Home, Accounts, Transactions, Graphics, monthly flow, import preview and backup verification must call shared ledger/aggregation services rather than implement their own balance formulas.

Suggested V1 record shapes (field names can be finalized while writing TypeScript, but semantics must not silently change):

```text
Shared: id, type, date, time?, remark?, tagIds[], source,
        sourceReference?, createdAt, updatedAt

opening:    accountId, amountPaisa >= 0  (at most one per account)
income:     accountId, amountPaisa > 0, categoryId, subcategoryId?
expense:    accountId, amountPaisa > 0, categoryId, subcategoryId?
transfer:   fromAccountId != toAccountId, amountPaisa > 0
adjustment: accountId, deltaPaisa != 0, reason,
            calculatedBeforePaisa?, actualAtTimePaisa?
```

- `amountPaisa` and totals must remain safe integers. Decimal text is parsed exactly (maximum two fractional digits); reject non-finite, negative/zero ordinary amounts and overflow. A zero **opening** is valid. Signed adjustment delta is separate from a positive transaction amount. Balances may be negative after genuine spending/backdated changes; display and flag them, not hide or clamp them.
- Use stable IDs; persist actual source values such as `manual`, `bank_statement`, `wallet_statement`, `imported`. Keep archived account/category references in historical records. An income/expense needs a compatible category; transfer needs two distinct accounts and no category. Other record types do not contribute to ordinary income/expense.
- Dates are calendar days in Kathmandu. Optional `time` is display/order information, not the source of a UTC month. Multiple transactions on one date all count in that date; a dated reconciliation's displayed before/after are **audit values at creation time**, not a promise that backdated edits can never change that date's later computed balance. If earlier activity changes, keep the delta fixed and flag the reconciliation for review instead of silently changing it.
- `calculateAccountBalance(accountId, exclusiveEndDate)` sums all effects dated **before** the exclusive date; current balance includes all transactions through today's Kathmandu date (future-dated entries do not affect the displayed current balance until their date). `calculateMonthOpening(YYYY-MM)` uses the first day as exclusive end; closing uses the first day of the following month as exclusive end. Historical as-of balance uses the day after the displayed as-of date as exclusive end. Range `[start, endExclusive)` drives list/charts/aggregations.
- Each transaction effect on an account: opening `+amount`, income `+amount`, expense `−amount`, transfer from `−amount`, transfer to `+amount`, adjustment `+delta`. Across all owned NPR accounts, transfers net to zero. Monthly operating net is `income − expense`; monthly total-balance change also includes adjustments and opening entries of newly added accounts.
- Validate all writes. A multi-table write (new account + opening entry, import rows + provenance, confirmation + metadata updates, restore) uses one Dexie transaction. Deleting/editing a past transaction recalculates derived reports instead of rewriting monthly openings.

### Boundary and future-date rule

October 2026 opening means all entries dated **before 2026-10-01**, not those dated on October 1. An account created on October 1 or later has a separate `New account: starting balance` line; its opening entry affects October closing, not September closing or October carried-forward opening. A future-dated transaction must appear as scheduled/future in history but not in the **right now** Home balance until its Kathmandu date. No recurring/scheduled transaction automation is introduced by this rule.

## 3. Month record contract

V1 uses a `monthlyConfirmations` table, **not financial snapshots**:

```text
monthKey: YYYY-MM (unique)
confirmedAt: UTC timestamp
openingChangedSinceConfirmation: boolean (default false)
```

- First-use setup starts the tracking month without inventing a confirmation of a previous month. The next new calendar month gets the normal prompt. A new account added midmonth uses only its one opening record and does not reopen the month prompt.
- On first open/resume in a new month, derive opening amounts live; prompt for the current month if not confirmed. One button records acknowledgment only, idempotently. Access to historical records remains available while the prompt is pending. Previously missed months can be displayed as unconfirmed derived periods without extra prompts.
- On retroactive create/edit/delete/import of any entry dated **before the start** of a confirmed month, set that month's `openingChangedSinceConfirmation` flag in the same write transaction. For edits compare both old and new effective dates. Do not set the flag for regular transactions dated during that month: these change monthly activity, not its confirmed opening. Opening/closing numbers are always recalculated from the ledger, and the original `confirmedAt` stays intact. Show a `Previously confirmed opening has changed` notice until the user acknowledges/reviews it; any later UX for resetting the flag must not create money.
- Review/Edit an opening amount is a **dated adjustment** (usually October 1 for an October start correction). The carry-forward from September remains its calculated September closing; show the October 1 adjustment explicitly as a separate correction, never relabel it as income or secretly rewrite September.

## 4. Worked acceptance fixture (all figures in NPR)

Assume each account has exactly one dated opening entry on or before **2026-09-30**, with no other September activity. Khalti is the wallet account; opening records count once only.

| After event | Cash | Nabil | eSewa | Khalti | NMB | Total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| September 30 closing | 2,000 | 15,000 | 3,500 | 800 | — | **21,300** |
| October 1: confirm October | 2,000 | 15,000 | 3,500 | 800 | — | **21,300** |
| October 2: eSewa Food expense 180 | 2,000 | 15,000 | 3,320 | 800 | — | **21,120** |
| October 3: Nabil Salary income 25,000 | 2,000 | 40,000 | 3,320 | 800 | — | **46,120** |
| October 4: transfer Nabil → eSewa 2,000 | 2,000 | 38,000 | 5,320 | 800 | — | **46,120** |
| October 5: eSewa actual 5,270; adjustment −50 | 2,000 | 38,000 | 5,270 | 800 | — | **46,070** |
| October 10: create NMB with opening 500 | 2,000 | 38,000 | 5,270 | 800 | 500 | **46,570** |
| November 1: confirm November twice/reload | 2,000 | 38,000 | 5,270 | 800 | 500 | **46,570** |

**Hand-check:** October opening `21,300`; October income `25,000`, expense `180`, operating net `24,820`, adjustment `−50`, new-account opening `500`. October closing = `21,300 + 25,000 − 180 − 50 + 500 = 46,570`. The transfer has zero effect on the total; the reconciliation is not an expense; repeated confirmation has zero effect. October opening is still `21,300` even though NMB appears later.

**Backdated edit:** after November was confirmed, change the October 2 eSewa expense from `180` to `200`. Current eSewa becomes `5,250` and overall November opening becomes `46,550`; November's `openingChangedSinceConfirmation` is true and its confirmation timestamp is preserved. October's confirmed opening still equals `21,300`. October 5's originally recorded audit was `5,320 → 5,270` with delta `−50`; after the edit its computed values would be `5,300 → 5,250`, so flag the reconciliation for review without changing its signed delta. No new opening record is created.

**Archive check:** an account with balance `800` cannot be archived. Transfer its `800` to another owned account first: source becomes zero, destination increases by `800`, overall total stays equal, and archiving succeeds. If a subsequent backdated record makes the archived account `−25`, warn and include that `−25` in total; do not hide or clamp it.

**Date check:** a transaction dated `2026-10-01` belongs to October even if its UTC audit timestamp is still September 30; `2026-10-31` belongs to October and `2026-11-01` belongs to November. Dates are interpreted in Asia/Kathmandu, not the device's travel timezone.

These are **hand-calculated expected outputs**, not passing test results. Encode them in automated ledger/date/database tests in Phases 2–4; the live app cannot be compared yet because Phase 1 has not begun.

## 5. Import and backup boundary contracts

- CSV/XLSX parsers yield non-persisted candidate rows with source row/sheet, raw description/reference/balance, parsed Kathmandu date, signed direction (debit or credit), positive amount in paisa, selected account/category and validation/duplicate warnings. Stage creation of a new account until final commit. A debit/credit mapping must identify direction; do not treat statement credit/debit as a proven transfer.
- Preview precedes every financial import write. The user can fix/exclude rows and choose Skip or Keep Both for duplicate candidates. Recheck on commit, including within-file duplicates; write selected valid rows and provenance atomically. A bank debit and wallet credit can only be combined into a single transfer with explicit user confirmation; otherwise ask the user to classify or skip them. No PDF candidates in V1.
- JSON backup envelope version **1** includes format/schema version, exported UTC timestamp and all tables/metadata (account types, accounts, categories, tags, transactions, monthly confirmations, mappings, settings). Do not export the statement files themselves by default. Validate version, references, dates, money and IDs before showing a replace-all preview. Unsupported newer versions fail safely. Old supported versions use explicit migrations. Invalid/canceled restore leaves the database unchanged. Post-restore balances are re-derived from ledger records.
- Show `Last export initiated`, not an unprovable claim of successful file saving. Warn that JSON backups are plaintext financial information. CSV export must make transfers and adjustments identifiable and escape spreadsheet formula-like text.

## 6. Tool/dependency notes for future phases

- Phase 1 candidates: React Router for navigation, Vitest + fake-indexeddb for financial/database tests, Playwright for mobile/offline end-to-end coverage. No packages have been installed in Phase 0.
- Phase 7 XLSX candidate: **official SheetJS Community Edition**, bundled for offline use. Its documentation says the public npm `xlsx` package is stuck at `0.18.5` and the authoritative release is the project's versioned tarball; official docs currently show `0.20.3`. Avoid blindly installing the old npm release or an unmaintained repackaging. Before installation, confirm the current official version, tarball integrity, CE license/attribution terms, vulnerability status and offline browser behavior; pin an audited artifact/version. Official installation notes: https://docs.sheetjs.com/docs/getting-started/installation/frameworks/ . This is a candidate, **not an installed or final dependency**.
- Phase 7 file-size/row limits and resource safeguards will be specified/tested before XLSX parsing is enabled. Phase 8 tests privacy, offline installs, upgrades, storage loss warnings and backup recovery.

## 7. Phase 0 gate and handoff

- [x] Inspected the repository: at Phase 0 start it contained only `plan.md` and `Step.md`.
- [x] Read product/implementation plans and recorded the owner's explicit approved decisions, including PDF placeholder-only scope.
- [x] Specified the proposed ledger, calendar, month, import and backup contracts above.
- [x] Hand-checked account sums, transfer conservation, monthly carry-forward, adjustment, archive and retroactive-change examples.
- [x] Identified XLSX distribution risk and Phase 1 routing/test candidates; no dependency or app scaffold created.
- [ ] Automated fixture verification: **not possible yet**; scheduled for Phases 2–4 after Phase 1 scaffolding.

**Next authorized step when requested:** Phase 1 — scaffold the Vite/React/TypeScript mobile/offline shell and Dexie foundation, set up the test tools, then demonstrate its Phase 1 gate. Stop for review before Phase 2.
