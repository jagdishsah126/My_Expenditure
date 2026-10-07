// All amounts in the ledger are integer NPR paisa (100 paisa = Rs 1).
export function assertSafePaisa(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("Paisa must be a safe integer");
  }
  return value;
}

export function addPaisa(left: number, right: number): number {
  return assertSafePaisa(assertSafePaisa(left) + assertSafePaisa(right));
}

/** Parse decimal NPR text exactly. Zero is permitted only for an account opening. */
export function parseNprToPaisa(
  input: string,
  options: { allowZero?: boolean } = {},
): number {
  const match = /^\s*(\d+)(?:\.(\d{1,2}))?\s*$/.exec(input);
  if (!match)
    throw new RangeError(
      "Enter a non-negative NPR amount with at most two decimal places",
    );

  const value =
    BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Amount exceeds the safe paisa limit");
  }
  if (value === 0n && !options.allowZero) {
    throw new RangeError("Amount must be greater than zero");
  }
  return Number(value);
}

/** No floating-point arithmetic, even at the safe-integer limit. */
export function formatNpr(paisa: number): string {
  assertSafePaisa(paisa);
  const negative = paisa < 0;
  const absolute = BigInt(paisa < 0 ? -paisa : paisa);
  const rupees = (absolute / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}Rs ${rupees}.${fraction}`;
}
