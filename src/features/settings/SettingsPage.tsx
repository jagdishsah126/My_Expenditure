import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Link } from "react-router-dom";
import { Field } from "../../components/ui/Field";
import { db } from "../../db/database";
import { setReduceMotion } from "../../db/repositories/preferences";
import { preferencesSchema } from "../../db/schema";
import { BackupPanel } from "../backup/BackupPanel";

export function SettingsPage() {
  const record = useLiveQuery(() => db.settings.get("preferences"), []);
  const parsed = preferencesSchema.safeParse(record);
  const [error, setError] = useState<string | null>(null);
  const checkbox = useRef<HTMLInputElement>(null);

  async function changePreference(reduceMotion: boolean) {
    setError(null);
    try {
      await setReduceMotion(db, reduceMotion);
    } catch {
      if (checkbox.current && parsed.success) {
        checkbox.current.checked = parsed.data.value.reduceMotion;
      }
      setError(
        "Could not save this preference. Your previous setting is unchanged.",
      );
    }
  }

  return (
    <>
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-forest/70">
          Your app
        </p>
        <h1 className="mt-2 text-3xl font-bold">Settings</h1>
        <p className="mt-2 text-sm text-ink/70">
          Preferences and data tools. Financial data remains local to this
          browser in V1.
        </p>
      </header>
      <div className="grid gap-5">
        <section className="rounded-3xl border border-forest/10 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-bold">Display preferences</h2>
          {record === undefined ? (
            <p role="status" className="mt-4 text-sm text-ink/70">
              Loading local preferences…
            </p>
          ) : parsed.success ? (
            <div className="mt-5">
              <Field
                label="Reduce interface motion"
                description="Also respects your device’s reduced-motion setting."
              >
                {(id, descriptionId) => (
                  <input
                    id={id}
                    key={parsed.data.updatedAt}
                    ref={checkbox}
                    aria-describedby={descriptionId}
                    type="checkbox"
                    defaultChecked={parsed.data.value.reduceMotion}
                    onChange={(event) =>
                      void changePreference(event.target.checked)
                    }
                    className="h-6 w-6 accent-forest"
                  />
                )}
              </Field>
            </div>
          ) : (
            <p role="alert" className="mt-4 text-sm text-red-800">
              Stored preferences could not be read. They were not overwritten.
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-sm text-red-800">
              {error}
            </p>
          )}
        </section>

        <section className="rounded-3xl border border-forest/10 bg-white p-5 shadow-sm sm:p-7">
          <h2 className="text-xl font-bold">Data tools</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Link
              to="/import"
              className="rounded-2xl bg-leaf/60 p-4 font-semibold text-forest"
            >
              Import CSV/XLSX statements →
              <span className="block text-sm font-normal text-ink/70">
                PDF import is under construction.
              </span>
            </Link>
            <Link
              to="/categories"
              className="rounded-2xl bg-paper p-4 font-semibold text-forest"
            >
              Manage categories and tags →
            </Link>
          </div>
        </section>

        <BackupPanel />

        <section className="rounded-3xl bg-leaf/55 p-5 text-sm leading-6">
          <h2 className="font-bold">Your data stays on this device</h2>
          <p className="mt-2">
            Clearing this browser’s site data can erase local records. Export a
            JSON backup regularly, especially before changing browsers or
            devices. No account registration, analytics or cloud upload is used.
          </p>
        </section>
      </div>
    </>
  );
}
