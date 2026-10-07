# My Finance

A mobile-first, offline-first, local-first personal finance PWA for tracking NPR across cash, banks, digital wallets and cash-like investment accounts.

**Status: V1 candidate.** The core app is implemented and covered by unit and browser tests. Review it with real workflows before trusting it as your only financial record, and export JSON backups regularly.

## What is included

- Installable PWA with offline application shell and offline local data access after first load
- Multiple accounts and user-defined account types
- One dated opening entry per account
- Zero-balance archive rule, restore, and warnings for archived accounts that later become nonzero
- Custom categories, subcategories, icons, archive/restore and ordering
- Tags
- Fast expense, income and internal transfer entry
- One canonical transfer record; transfers never count as income or expense
- Edit/delete history, remarks, time, source and filters
- Shared integer-paisa ledger selectors for balances and reports
- Asia/Kathmandu calendar dates and month boundaries
- One-tap monthly confirmation without creating money
- Dated signed reconciliation adjustments with reason and audit values
- Dashboard with total, account balances, monthly income/expense/net and recent activity
- Graphics for trends, income vs expense, categories, accounts, daily spending, income sources and account spending
- Reviewed CSV/XLSX statement import with column mapping, editable preview, duplicate warnings, saved mappings and atomic commit
- PDF import placeholder only (`Under construction`); PDFs are not read
- Complete JSON backup, validated replace-all restore, and CSV transaction export
- Local-only data: no login, backend, bank connection, analytics or cloud sync

## Important local-data warning

IndexedDB is the source of truth, but browser/site data can be cleared or evicted. Export a complete JSON backup before changing browsers/devices and after important changes. JSON backups are plaintext sensitive financial data.

## Requirements

- Node.js 20.19+ and npm
- A browser with IndexedDB and service-worker support

## Run locally

```bash
npm ci
npm run dev
```

Development mode is not the installed/offline production PWA. For production-like PWA testing:

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

Open `http://127.0.0.1:4173`, load it once, then the built shell can reload offline. Production deployment requires HTTPS and SPA route fallback.

## Verification

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm audit --audit-level=moderate
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser suite covers the mobile shell, offline reload, installability checks, account creation, transaction entry, transfer invariants, monthly confirmation, reconciliation, archive blocking, graphics loading, backup/restore and CSV import.

## Architecture

- `plan.md` — product vision
- `Step.md` — approved phased implementation plan
- `Decisions.md` — Phase 0 financial contracts and worked examples
- `src/db/database.ts` — Dexie/IndexedDB source of truth
- `src/db/schema.ts` — Zod persistence schemas
- `src/features/ledger/` — shared balance and report selectors
- `src/features/accounts/` — account types, accounts, opening and archive logic
- `src/features/categories/` — categories, subcategories, ordering and tags
- `src/features/transactions/` — validated transaction writes and history UI
- `src/features/monthly/` — Kathmandu month confirmation metadata
- `src/features/graphics/` — shared chart aggregations and Recharts UI
- `src/features/backup/` — JSON/CSV export and replace-all restore
- `src/features/import/` — local CSV/XLSX parser, mapping, preview and atomic import
- `src/stores/ui.ts` — UI-only Zustand state; no financial records

Money is stored as integer paisa. Date-only ledger values are Kathmandu calendar dates (`YYYY-MM-DD`); audit timestamps are UTC ISO strings. UI screens consume shared ledger selectors instead of maintaining independent balance state.

## XLSX dependency

XLSX support uses SheetJS Community Edition 0.20.3 from the official SheetJS distribution URL pinned in `package.json`. The installed package reports the Apache-2.0 license. It is bundled locally so imported statements do not leave the browser.

## Deployment

`vercel.json` includes the SPA rewrite needed by Vercel. Deploy the production build behind HTTPS, then test installation, offline reload and service-worker update behavior on the target device.

## Deliberate V1 limits

- NPR-only aggregation; no exchange rates
- Investment accounts are cash-like balances, not portfolio valuation
- PDF import is a disabled placeholder
- Restore is replace-all, not merge
- Statement import does not infer internal transfers from one side of a statement
- No budgets, recurring transactions, cloud backup, sync, bank APIs or notifications
