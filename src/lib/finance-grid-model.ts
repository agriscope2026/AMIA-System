export function sortFinanceRows<T>(
  rows: readonly T[],
  getValue: (row: T) => unknown,
  numeric: boolean,
  direction: "asc" | "desc",
): T[] {
  return rows.map((row, index) => ({ row, index })).sort((left, right) => {
    const a = getValue(left.row);
    const b = getValue(right.row);
    const aNumber = Number(a);
    const bNumber = Number(b);
    const compared = numeric && Number.isFinite(aNumber) && Number.isFinite(bNumber)
      ? aNumber - bNumber
      : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true, sensitivity: "base" });
    return compared === 0 ? left.index - right.index : direction === "desc" ? -compared : compared;
  }).map(({ row }) => row);
}

export function isValidFinanceBudget(value: string) {
  return /^\d{1,12}(?:\.\d{1,2})?$/.test(value);
}
