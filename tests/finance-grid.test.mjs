import assert from "node:assert/strict";
import test from "node:test";
import { evaluateFinanceFormula } from "../src/lib/finance-formulas.ts";
import { financeGridHistoryReducer } from "../src/lib/finance-grid-history.ts";
import { isValidFinanceBudget, sortFinanceRows } from "../src/lib/finance-grid-model.ts";

test("finance formulas evaluate arithmetic, references, and ranges", () => {
  const values = [10, 20, 30];
  const lookup = (row, column) => column === 0 ? values[row] : 0;

  assert.equal(evaluateFinanceFormula("=SUM(A1:A3)*2+5", lookup), 125);
  assert.equal(evaluateFinanceFormula("=AVERAGE(A1:A3)", lookup), 20);
  assert.equal(evaluateFinanceFormula("=B1+A2", lookup), 20);
});

test("finance formulas report invalid expressions", () => {
  assert.match(String(evaluateFinanceFormula("=SUM(A1:)", () => 1)), /^#ERROR:/);
  assert.match(String(evaluateFinanceFormula("=1/0", () => 0)), /^#ERROR:/);
});

test("finance row sorting handles numbers and preserves ties", () => {
  const rows = [
    { id: "first", amount: 20 },
    { id: "second", amount: 5 },
    { id: "third", amount: 5 },
  ];

  assert.deepEqual(sortFinanceRows(rows, (row) => row.amount, true, "asc").map((row) => row.id), ["second", "third", "first"]);
  assert.deepEqual(sortFinanceRows(rows, (row) => row.amount, true, "desc").map((row) => row.id), ["first", "second", "third"]);
});

test("financial budgets require non-negative decimal strings with at most two cents", () => {
  assert.equal(isValidFinanceBudget("0"), true);
  assert.equal(isValidFinanceBudget("125000.50"), true);
  assert.equal(isValidFinanceBudget("999999999999.99"), true);
  assert.equal(isValidFinanceBudget("-1.00"), false);
  assert.equal(isValidFinanceBudget("1.005"), false);
  assert.equal(isValidFinanceBudget("1000000000000"), false);
  assert.equal(isValidFinanceBudget("1e3"), false);
});

test("undo and redo restore snapshots and discard a stale redo branch", () => {
  let history = { past: [], current: { value: "initial" }, future: [] };
  history = financeGridHistoryReducer(history, { type: "set", value: { value: "edited" } });
  history = financeGridHistoryReducer(history, { type: "undo" });
  assert.deepEqual(history.current, { value: "initial" });
  assert.equal(history.future.length, 1);
  history = financeGridHistoryReducer(history, { type: "set", value: { value: "replacement" } });
  assert.equal(history.future.length, 0);
  history = financeGridHistoryReducer(history, { type: "undo" });
  assert.deepEqual(history.current, { value: "initial" });
  history = financeGridHistoryReducer(history, { type: "redo" });
  assert.deepEqual(history.current, { value: "replacement" });
});
