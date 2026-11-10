import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsv, guessType, guessTable, matchColumns, tableNameFromFile } from "../js/mock/csv.js";

test("parseCsv handles quotes, line breaks, BOM, CRLF and empty cells", () => {
  const r = parseCsv('\uFEFFid,Full Name,note\r\n1,"Smith, Ann","said ""hi""\nthen left"\r\n2,,\r\n\r\n');
  assert.deepEqual(r.header, ["id", "full_name", "note"]);
  assert.deepEqual(r.rows, [["1", "Smith, Ann", 'said "hi"\nthen left'], ["2", null, null]]);
  assert.equal(r.delimiter, ",");
  assert.deepEqual(r.warnings, []);
});

test("parseCsv finds ; and tab separators, fixes headers, reports ragged rows", () => {
  const semi = parseCsv("a;b;b;1st\n1,5;2;3;4\n");
  assert.equal(semi.delimiter, ";");
  assert.deepEqual(semi.header, ["a", "b", "b_2", "c_1st"]);
  assert.deepEqual(semi.rows, [["1,5", "2", "3", "4"]]);
  const tab = parseCsv("x\ty\n1\t2\n3\n4\t5\t6\n");
  assert.equal(tab.delimiter, "\t");
  assert.deepEqual(tab.rows, [["1", "2"], ["3", null], ["4", "5"]]);
  assert.match(tab.warnings[0], /^2 rows have a different number of values/);
  assert.deepEqual(parseCsv("").warnings, ["The file is empty."]);
  assert.deepEqual(parseCsv(",x\n1,2\n").header, ["column_1", "x"]);
});

test("guessType picks the narrowest type every value fits", () => {
  const t = (...v) => guessType(v).type;
  assert.equal(t("1", "22", null, "-3"), "integer");
  assert.equal(t("1", "3000000000"), "bigint");
  assert.equal(t("1.5", "22", "3.125"), "numeric(12,3)");
  assert.equal(t("yes", "No", "TRUE"), "boolean");
  assert.equal(t("2026-11-10", "2025-01-31"), "date");
  assert.equal(t("2026-11-10 09:30", "2026-11-10"), "timestamp");
  assert.equal(t("2026-11-10T09:30:00Z"), "timestamptz");
  assert.equal(t("0b9e1c3a-5d5e-4c2b-9a77-3c1f0f7e8a11"), "uuid");
  assert.equal(t("hello", "1"), "text");
  assert.match(guessType(["00123", "45"]).note, /leading zeros/);
  assert.match(guessType(["10/11/2026"]).note, /day\/month/);
  assert.match(guessType([null, ""]).note, /empty/);
});

test("guessTable finds the key and references to other tables", () => {
  const header = ["id", "customer_id", "product_id", "qty", "sold_on"];
  const rows = [["1", "7", "2", "3", "2026-01-02"], ["2", "7", null, "1", "2026-02-03"]];
  const g = guessTable("sales", header, rows, [{ name: "customer", pk: "id" }, { name: "products", pk: "product_id" }]);
  assert.deepEqual(g.columns.map((c) => [c.name, c.type, c.pk, c.nullable, c.references]), [
    ["id", "integer", true, false, null],
    ["customer_id", "integer", false, false, "customer.id"],
    ["product_id", "integer", false, true, "products.product_id"],
    ["qty", "integer", false, false, null],
    ["sold_on", "date", false, false, null]
  ]);
  assert.match(g.columns[0].notes.pk, /every value is different/);
  // No key when ids repeat; self reference to its own key.
  const emp = guessTable("employees", ["employee_id", "manager_id", "employees_id"], [["1", null, "1"], ["2", "1", "1"]]);
  assert.equal(emp.columns[0].pk, true);
  assert.equal(emp.columns[2].references, "employees.employee_id");
  assert.equal(guessTable("t", ["id"], [["1"], ["1"]]).columns[0].pk, false);
});

test("matchColumns lines CSV columns up with a table by name", () => {
  const m = matchColumns([{ name: "id" }, { name: "Email" }, { name: "city" }], ["email", "id", "extra"]);
  assert.deepEqual(m.idx, [1, 0, -1]);
  assert.deepEqual(m.unused, ["extra"]);
  assert.equal(tableNameFromFile("Customer Orders (2026).csv"), "customer_orders_2026");
  assert.equal(tableNameFromFile("2026.csv"), "t_2026");
});
