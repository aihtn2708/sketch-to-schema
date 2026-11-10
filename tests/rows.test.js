import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCompact, fromModel } from "../js/schema/model.js";
import { generateRows, generateData } from "../js/mock/generate.js";
import { rowsToSql, lineUp, remap, checkTable, typeProblem, toCsv, cleanTables, tableOrder } from "../js/mock/rows.js";

const shop = () => fromModel(fromCompact({ tables: [
  { n: "sales", cols: [{ n: "id", t: "integer", pk: true }, { n: "customer_id", t: "integer", nul: false, ref: "customer.id" }, { n: "amount", t: "numeric(8,2)" }, { n: "paid", t: "boolean" }, { n: "sold_at", t: "timestamp" }] },
  { n: "customer", cols: [{ n: "id", t: "int", pk: true }, { n: "name", t: "string" }, { n: "email", t: "varchar(20)", u: true, nul: false }] }
] })).tables;

test("generateRows gives text rows per table id, parents first", () => {
  const t = shop(), data = generateRows(t, { rows: 5, seed: 1 });
  const [sales, customer] = t;
  assert.deepEqual(tableOrder(t).map((x) => x.name), ["customer", "sales"]);
  assert.equal(data[customer.id].rows.length, 5);
  assert.equal(data[sales.id].rows.length, 20);
  assert.equal(data[sales.id].source, "generated");
  assert.deepEqual(data[sales.id].cols.map((c) => c.name), ["id", "customer_id", "amount", "paid", "sold_at"]);
  for (const row of data[sales.id].rows) {
    assert.ok(row.every((v) => v === null || typeof v === "string"));
    if (row[2] !== null) assert.match(row[2], /^\d+\.\d\d$/);
    if (row[3] !== null) assert.match(row[3], /^(true|false)$/);
  }
  assert.deepEqual(checkTable(sales, data[sales.id].rows, t, data), {});
  assert.deepEqual(checkTable(customer, data[customer.id].rows, t, data), {});
});

test("kept tables stay as they are and still act as parents", () => {
  const t = shop(), [sales, customer] = t;
  const keep = { [customer.id]: { rows: [["7", "Ann", "a@x.io"], ["9", "Bo", "b@x.io"]], source: "imported" } };
  const data = generateRows(t, { rows: 5, seed: 3, keep });
  assert.deepEqual(data[customer.id].rows, keep[customer.id].rows);
  assert.equal(data[customer.id].source, "imported");
  const ids = new Set(data[sales.id].rows.map((r) => r[1]));
  for (const id of ids) assert.ok(id === "7" || id === "9", id);
});

test("rowsToSql writes numbers and booleans bare and quotes the rest", () => {
  const t = shop(), [sales, customer] = t;
  const data = {
    [customer.id]: { name: "customer", cols: customer.columns.map((c) => ({ id: c.id, name: c.name })), rows: [["1", "O'Neil", "o@x.io"], ["2", null, "p@x.io"]], source: "edited" }
  };
  const sql = rowsToSql(t, data);
  assert.match(sql, /INSERT INTO customer \(id, name, email\) VALUES\n  \(1, 'O''Neil', 'o@x\.io'\),\n  \(2, NULL, 'p@x\.io'\);/);
  assert.match(sql, /-- sales: no rows/);
  assert.equal(generateData(t, { rows: 3, seed: 1 }).sql, rowsToSql(t, generateRows(t, { rows: 3, seed: 1 }), "generated from the draft schema (seed 1)"));
});

test("rows follow the draft: columns matched by id, then name; new columns empty", () => {
  const t = shop(), customer = t[1];
  const d = { name: "customer", cols: [{ id: "old", name: "Email" }, { id: customer.columns[0].id, name: "renamed_id" }], rows: [["e@x", "1"]], source: "edited" };
  assert.deepEqual(lineUp(customer, d), [["1", null, "e@x"]]);
  assert.deepEqual(remap(customer, d).cols.map((c) => c.name), ["id", "name", "email"]);
});

test("checkTable finds type, NOT NULL, unique and reference problems", () => {
  const t = shop(), [sales, customer] = t;
  const data = { [customer.id]: { name: "customer", cols: customer.columns.map((c) => ({ id: c.id, name: c.name })), rows: [["1", "A", "a@x"], ["1", "B", null]], source: "edited" } };
  const c = checkTable(customer, data[customer.id].rows, t, data);
  assert.match(c["1:0"], /Repeats row 1/);
  assert.match(c["0:0"], /Repeated in row 2/);
  assert.match(c["1:2"], /NOT NULL/);
  const s = checkTable(sales, [["x", "5", "1234567.5", "maybe", "2026-02-30 10:00"]], t, data);
  assert.match(s["0:0"], /whole number/);
  assert.match(s["0:1"], /No customer row has id = 5/);
  assert.match(s["0:2"], /Too large for numeric\(8,2\)/);
  assert.match(s["0:3"], /true or false/);
  assert.match(s["0:4"], /date and time/);
  assert.equal(typeProblem("varchar(3)", "abcd"), "Longer than 3 characters.");
  assert.equal(typeProblem("timestamp", "2026-11-10T09:30:00Z"), "");
  assert.equal(typeProblem("jsonb", "{\"a\":1}"), "");
});

test("toCsv quotes what needs quoting; cleanTables keeps good entries", () => {
  assert.equal(toCsv(["a", "b"], [["x,y", null], ['say "hi"', " pad"]]), 'a,b\r\n"x,y",\r\n"say ""hi"""," pad"\r\n');
  const out = cleanTables({ t1: { name: "a", cols: [{ id: "c", name: "x" }], rows: [[1], [null], "bad"], source: "nope" }, t2: { cols: [] }, t3: null });
  assert.deepEqual(Object.keys(out), ["t1"]);
  assert.deepEqual(out.t1.rows, [["1"], [null]]);
  assert.equal(out.t1.source, "edited");
});
