import type { FinanceDatabase } from "../database";
import { preferencesSchema, type Preferences } from "../schema";

const KEY = "preferences";

export async function initializePreferences(
  database: FinanceDatabase,
): Promise<Preferences> {
  return database.transaction("rw", database.settings, async () => {
    const existing = await database.settings.get(KEY);
    if (existing) return preferencesSchema.parse(existing);

    const initial: Preferences = {
      key: KEY,
      value: { reduceMotion: false },
      updatedAt: new Date().toISOString(),
    };
    await database.settings.add(initial);
    return initial;
  });
}

export async function setReduceMotion(
  database: FinanceDatabase,
  reduceMotion: boolean,
): Promise<void> {
  await database.transaction("rw", database.settings, async () => {
    const current = preferencesSchema.parse(await database.settings.get(KEY));
    await database.settings.put(
      preferencesSchema.parse({
        ...current,
        value: { ...current.value, reduceMotion },
        updatedAt: new Date().toISOString(),
      }),
    );
  });
}
