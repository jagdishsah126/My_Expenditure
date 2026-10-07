import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/app";
import { db } from "./db/database";
import { initializePreferences } from "./db/repositories/preferences";
import { seedDefaults } from "./features/accounts/defaults";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

initializePreferences(db)
  .then(() => seedDefaults(db))
  .then(() =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  )
  .catch(() =>
    root.render(
      <main className="mx-auto max-w-lg p-8" role="alert">
        <h1 className="text-2xl font-bold">Local storage is unavailable</h1>
        <p className="mt-4">
          My Finance cannot safely start without access to this browser’s local
          database. Check site permissions or storage settings, then reload.
        </p>
      </main>,
    ),
  );
