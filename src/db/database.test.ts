import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import { FinanceDatabase } from "./database";
import {
  initializePreferences,
  setReduceMotion,
} from "./repositories/preferences";
import { accountSchema, preferencesSchema, transactionSchema } from "./schema";

const databases: FinanceDatabase[] = [];
const names: string[] = [];
function uniqueName() {
  const name = `finance-test-${crypto.randomUUID()}`;
  names.push(name);
  return name;
}
function openApp(name: string) {
  const database = new FinanceDatabase(name);
  databases.push(database);
  return database;
}

afterEach(async () => {
  for (const database of databases) database.close();
  databases.length = 0;
  for (const name of names) await Dexie.delete(name);
  names.length = 0;
});

describe("Phase 1 database foundation", () => {
  it("initializes a local preference once and keeps writes after reopening", async () => {
    const name = uniqueName();
    const first = openApp(name);
    const initial = await initializePreferences(first);
    expect(initial.value.reduceMotion).toBe(false);
    await setReduceMotion(first, true);
    first.close();

    const reopened = openApp(name);
    expect((await initializePreferences(reopened)).value.reduceMotion).toBe(
      true,
    );
    expect(await reopened.settings.count()).toBe(1);
  });

  it("upgrades a version 1 preferences database to version 2 without losing the record", async () => {
    const name = uniqueName();
    const legacy = new Dexie(name);
    legacy.version(1).stores({ settings: "&key" });
    await legacy.table("settings").put({
      key: "preferences",
      value: { reduceMotion: true },
      updatedAt: "2026-09-30T18:15:00.000Z",
    });
    legacy.close();

    const upgraded = openApp(name);
    expect((await initializePreferences(upgraded)).value.reduceMotion).toBe(
      true,
    );
    expect(await upgraded.verno).toBe(2);
    expect(await upgraded.accounts.count()).toBe(0);
    expect(await upgraded.settings.count()).toBe(1);
  });

  it("does not overwrite an existing but malformed preference", async () => {
    const database = openApp(uniqueName());
    await database.settings.put({
      key: "preferences",
      value: { reduceMotion: "invalid" },
      updatedAt: new Date().toISOString(),
    });
    await expect(initializePreferences(database)).rejects.toThrow();
    expect((await database.settings.get("preferences"))?.value).toEqual({
      reduceMotion: "invalid",
    });
  });

  it("validates NPR-only account records and positive transaction amounts", () => {
    const now = new Date().toISOString();
    const record = {
      id: crypto.randomUUID(),
      name: "Cash",
      accountTypeId: crypto.randomUUID(),
      currency: "NPR",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    expect(accountSchema.safeParse(record).success).toBe(true);
    expect(
      accountSchema.safeParse({ ...record, currency: "USD" }).success,
    ).toBe(false);
    expect(
      preferencesSchema.safeParse({
        key: "preferences",
        value: { reduceMotion: true },
        updatedAt: now,
      }).success,
    ).toBe(true);
    const entry = {
      id: crypto.randomUUID(),
      type: "expense",
      date: "2026-10-02",
      tagIds: [],
      source: "manual",
      createdAt: now,
      updatedAt: now,
      accountId: record.id,
      categoryId: crypto.randomUUID(),
      amountPaisa: 0,
    };
    expect(transactionSchema.safeParse(entry).success).toBe(false);
  });
});
