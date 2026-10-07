import { z } from "zod";

const id = z.string().uuid();
const auditTime = z.iso.datetime();
const calendarDate = z.iso.date();
const paisa = z.number().int().safe();

export const accountTypeSchema = z.object({
  id,
  name: z.string().trim().min(1),
  icon: z.string().optional(),
  isBuiltIn: z.boolean(),
  createdAt: auditTime,
  updatedAt: auditTime,
});

export const accountSchema = z.object({
  id,
  name: z.string().trim().min(1),
  accountTypeId: id,
  currency: z.literal("NPR"),
  icon: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean(),
  createdAt: auditTime,
  updatedAt: auditTime,
});

export const categorySchema = z.object({
  id,
  name: z.string().trim().min(1),
  type: z.enum(["expense", "income", "both"]),
  parentId: id.optional(),
  sortOrder: z.number().int(),
  icon: z.string().optional(),
  isActive: z.boolean(),
  createdAt: auditTime,
  updatedAt: auditTime,
});

export const tagSchema = z.object({ id, label: z.string().trim().min(1) });

const transactionBase = z.object({
  id,
  date: calendarDate,
  time: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
  remark: z.string().optional(),
  tagIds: z.array(id),
  source: z.enum(["manual", "bank_statement", "wallet_statement", "imported"]),
  sourceReference: z.string().optional(),
  createdAt: auditTime,
  updatedAt: auditTime,
});

export const transactionSchema = z.discriminatedUnion("type", [
  transactionBase.extend({
    type: z.literal("opening"),
    accountId: id,
    amountPaisa: paisa.nonnegative(),
  }),
  transactionBase.extend({
    type: z.literal("income"),
    accountId: id,
    categoryId: id,
    subcategoryId: id.optional(),
    amountPaisa: paisa.positive(),
  }),
  transactionBase.extend({
    type: z.literal("expense"),
    accountId: id,
    categoryId: id,
    subcategoryId: id.optional(),
    amountPaisa: paisa.positive(),
  }),
  transactionBase.extend({
    type: z.literal("transfer"),
    fromAccountId: id,
    toAccountId: id,
    amountPaisa: paisa.positive(),
  }),
  transactionBase.extend({
    type: z.literal("adjustment"),
    accountId: id,
    deltaPaisa: paisa.refine((value) => value !== 0),
    reason: z.string().trim().min(1),
    calculatedBeforePaisa: paisa.optional(),
    actualAtTimePaisa: paisa.optional(),
  }),
]);

export const monthlyConfirmationSchema = z.object({
  monthKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  confirmedAt: auditTime,
  openingChangedSinceConfirmation: z.boolean(),
});

export const importMappingSchema = z.object({
  id,
  name: z.string().trim().min(1),
  format: z.enum(["csv", "xlsx"]),
  columns: z.record(z.string(), z.string()),
  updatedAt: auditTime,
});

export const preferencesSchema = z.object({
  key: z.literal("preferences"),
  value: z.object({ reduceMotion: z.boolean() }),
  updatedAt: auditTime,
});

export type AccountType = z.infer<typeof accountTypeSchema>;
export type Account = z.infer<typeof accountSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Tag = z.infer<typeof tagSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type MonthlyConfirmation = z.infer<typeof monthlyConfirmationSchema>;
export type ImportMapping = z.infer<typeof importMappingSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type Setting = { key: string; value: unknown; updatedAt: string };
