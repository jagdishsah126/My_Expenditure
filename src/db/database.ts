import Dexie, { type Table } from "dexie";
import type {
  Account,
  AccountType,
  Category,
  ImportMapping,
  MonthlyConfirmation,
  Setting,
  Tag,
  Transaction,
} from "./schema";

export class FinanceDatabase extends Dexie {
  accountTypes!: Table<AccountType, string>;
  accounts!: Table<Account, string>;
  categories!: Table<Category, string>;
  tags!: Table<Tag, string>;
  transactions!: Table<Transaction, string>;
  monthlyConfirmations!: Table<MonthlyConfirmation, string>;
  importMappings!: Table<ImportMapping, string>;
  settings!: Table<Setting, string>;

  constructor(name = "my-finance") {
    super(name);

    // The foundation schema allows an existing preferences-only database to upgrade without data loss.
    this.version(1).stores({ settings: "&key" });
    this.version(2).stores({
      settings: "&key, updatedAt",
      accountTypes: "&id, name",
      accounts: "&id, accountTypeId, isActive",
      categories: "&id, parentId, type, sortOrder",
      tags: "&id, &label",
      transactions:
        "&id, date, type, accountId, fromAccountId, toAccountId, categoryId, [accountId+date], [fromAccountId+date], [toAccountId+date]",
      monthlyConfirmations: "&monthKey",
      importMappings: "&id, format",
    });
  }
}

export const db = new FinanceDatabase();
