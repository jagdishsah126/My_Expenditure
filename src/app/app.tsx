import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { useRegisterSW } from "virtual:pwa-register/react";
import { db } from "../db/database";
import { preferencesSchema } from "../db/schema";
import { HomePage } from "../features/dashboard/HomePage";
import { useUiStore } from "../stores/ui";
import { formatNpr, parseNprToPaisa } from "../utils/money";
import { NotFound } from "./routes/Pages";

const AccountsPage = lazy(() =>
  import("../features/accounts/AccountsPage").then((module) => ({
    default: module.AccountsPage,
  })),
);
const CategoriesPage = lazy(() =>
  import("../features/categories/CategoriesPage").then((module) => ({
    default: module.CategoriesPage,
  })),
);
const GraphicsPage = lazy(() =>
  import("../features/graphics/GraphicsPage").then((module) => ({
    default: module.GraphicsPage,
  })),
);
const ImportPage = lazy(() =>
  import("../features/import/ImportPage").then((module) => ({
    default: module.ImportPage,
  })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);
const TransactionsPage = lazy(() =>
  import("../features/transactions/TransactionsPage").then((module) => ({
    default: module.TransactionsPage,
  })),
);
const TransactionEntry = lazy(() =>
  import("../features/transactions/TransactionsPage").then((module) => ({
    default: module.TransactionEntry,
  })),
);

const navigation = [
  { label: "Home", path: "/", icon: "⌂" },
  { label: "Transactions", path: "/transactions", icon: "⇄" },
  { label: "Graphics", path: "/graphics", icon: "▥" },
  { label: "Accounts", path: "/accounts", icon: "▣" },
  { label: "Settings", path: "/settings", icon: "⚙" },
];

function lazyRoute(children: ReactNode) {
  return (
    <Suspense fallback={<p role="status">Loading…</p>}>{children}</Suspense>
  );
}

function NetworkNotice() {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return !online ? (
    <p
      role="status"
      className="bg-leaf px-4 py-2 text-center text-xs font-medium"
    >
      Offline — your app shell and local data still work.
    </p>
  ) : null;
}

function PwaUpdates() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 bg-forest px-4 py-3 text-sm text-white"
    >
      <span>An app update is ready.</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="rounded-lg bg-white px-3 py-2 font-semibold text-forest"
      >
        Update
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        className="underline"
      >
        Later
      </button>
    </div>
  );
}

function Shell() {
  const addDialogOpen = useUiStore((state) => state.addDialogOpen);
  const setAddDialogOpen = useUiStore((state) => state.setAddDialogOpen);
  const record = useLiveQuery(() => db.settings.get("preferences"), []);
  const parsed = preferencesSchema.safeParse(record);

  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(
      parsed.success && parsed.data.value.reduceMotion,
    );
  }, [parsed.success, parsed.data?.value.reduceMotion]);

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <PwaUpdates />
      <NetworkNotice />
      <div className="mx-auto flex max-w-6xl flex-col md:min-h-dvh md:flex-row">
        <aside className="hidden w-56 shrink-0 border-r border-forest/10 px-5 py-8 md:block">
          <div className="text-xl font-black tracking-tight text-forest">
            ✦ My Finance
          </div>
          <p className="mt-2 text-xs text-ink/60">Offline-first · NPR</p>
          <nav aria-label="Main navigation" className="mt-12 grid gap-2">
            {navigation.map(({ label, path, icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === "/"}
                className={({ isActive }) =>
                  `flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
                    isActive
                      ? "bg-forest text-white"
                      : "text-ink/70 hover:bg-leaf/60"
                  }`
                }
              >
                <span aria-hidden="true" className="w-6 text-center text-lg">
                  {icon}
                </span>
                {label}
              </NavLink>
            ))}
          </nav>
        </aside>
        <div className="min-w-0 flex-1">
          <header className="flex items-center justify-between px-5 pb-2 pt-6 md:hidden">
            <span className="text-xl font-black tracking-tight text-forest">
              ✦ My Finance
            </span>
            <span className="rounded-full bg-leaf px-3 py-1 text-[0.65rem] font-bold uppercase tracking-wider">
              Private & local
            </span>
          </header>
          <main
            id="main-content"
            className="mx-auto max-w-3xl px-5 pb-44 pt-8 sm:px-8 md:pb-20 md:pt-16"
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/transactions"
                element={lazyRoute(
                  <TransactionsPage
                    formatAmount={formatNpr}
                    parseAmount={parseNprToPaisa}
                  />,
                )}
              />
              <Route path="/graphics" element={lazyRoute(<GraphicsPage />)} />
              <Route path="/accounts" element={lazyRoute(<AccountsPage />)} />
              <Route
                path="/categories"
                element={lazyRoute(<CategoriesPage />)}
              />
              <Route path="/settings" element={lazyRoute(<SettingsPage />)} />
              <Route path="/import" element={lazyRoute(<ImportPage />)} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </main>
        </div>
      </div>
      <button
        type="button"
        aria-label="Add transaction"
        onClick={() => setAddDialogOpen(true)}
        className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-5 z-20 grid h-14 w-14 place-items-center rounded-2xl bg-forest text-3xl text-white shadow-xl transition-transform hover:scale-105 md:bottom-8 md:right-8"
      >
        +
      </button>
      {addDialogOpen && (
        <Suspense fallback={null}>
          <TransactionEntry
            formatAmount={formatNpr}
            parseAmount={parseNprToPaisa}
          />
        </Suspense>
      )}
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-10 flex justify-around border-t border-forest/10 bg-white/95 px-1 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden"
      >
        {navigation.map(({ label, path, icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path === "/"}
            className={({ isActive }) =>
              `flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-xl text-[0.62rem] font-semibold ${
                isActive ? "bg-leaf text-forest" : "text-ink/65"
              }`
            }
          >
            <span aria-hidden="true" className="text-xl leading-6">
              {icon}
            </span>
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3"
      >
        Skip to content
      </a>
      <Shell />
    </BrowserRouter>
  );
}
