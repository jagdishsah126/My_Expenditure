import type { Transaction } from "../../db/schema";
import type { TransactionDraft } from "./service";
import type { RawTransactionForm } from "./TransactionForm";

export function toDraft(
  values: RawTransactionForm,
  amountPaisa: number,
  previous?: Transaction,
): TransactionDraft {
  const common = {
    date: values.date,
    time: values.time,
    remark: values.remark,
    tagIds: values.tagIds,
    source: previous?.source ?? ("manual" as const),
    sourceReference: previous?.sourceReference,
  };
  if (values.type === "transfer") {
    return {
      ...common,
      type: "transfer",
      amountPaisa,
      fromAccountId: values.accountId,
      toAccountId: values.toAccountId,
    };
  }
  return {
    ...common,
    type: values.type,
    amountPaisa,
    accountId: values.accountId,
    categoryId: values.categoryId,
    subcategoryId: values.subcategoryId,
  };
}
