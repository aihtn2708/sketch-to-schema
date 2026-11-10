import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCompact, fromModel } from "../js/schema/model.js";
import { pgType, kindOf, createSql, fkSteps, typeNotes, countSql } from "../js/mock/setup.js";
import { generateData } from "../js/mock/generate.js";
import { digest, sortRows, snapshot, compare, isOrdered, txControl, cleanTests } from "../js/mock/compare.js";

const shop = fromModel(fromCompact({ tables: [
  { n: "customer", cols: [{ n: "id", t: "int", pk: true }, { n: "name", t: "string" }, { n: "email", t: "varchar(80)", u: true, nul: false }, { n: "city", t: "text" }] },
  { n: "product", cols: [{ n: "id", t: "integer", pk: true }, { n: "name", t: "text" }, { n: "category", t: "text" }, { n: "price", t: "money" }] },
  { n: "sales", cols: [{ n: "id", t: "integer", pk: true }, { n: "customer_id", t: "integer", nul: false, ref: "customer.id" },
    { n: "product_id", t: "int", nul: false, ref: "product.id" }, { n: "quantity", t: "int" }, { n: "sale_date", t: "datetime" }] }
] })).tables;

test("pgType turns sketched types into PostgreSQL types", () => {
  const cases = { int: "integer", "INT UNSIGNED": "integer", string: "text", "varchar(80)": "varchar(80)", "nvarchar(20)": "varchar(20)",
    money: "numeric(12,2)", "decimal(5,1)": "numeric(5,1)", datetime: "timestamp", bool: "boolean", tinyint: "smallint",
    guid: "uuid", double: "double precision", "": "text", "weird thing": "text", jsonb: "jsonb", "char(3)": "char(3)" };
  for (const [raw, pg] of Object.entries(cases)) assert.equal(pgType(raw), pg, raw);
  assert.deepEqual(kindOf("numeric(5,1)"), { kind: "num", p: 5, s: 1 });
  assert.deepEqual(kindOf("varchar(80)"), { kind: "text", len: 80 });
  assert.equal(kindOf("timestamp").kind, "ts");
});

test("createSql has keys but no foreign keys; fkSteps adds them after", () => {
  const sql = createSql(shop);
  assert.match(sql, /CREATE TABLE customer \(\n  id integer PRIMARY KEY,\n  name text,\n  email varchar\(80\) NOT NULL UNIQUE/);
  assert.match(sql, /sale_date timestamp/);
  assert.doesNotMatch(sql, /REFERENCES/);
  const fks = fkSteps(shop);
  assert.equal(fks.length, 2);
  assert.equal(fks[0].label, "sales.customer_id → customer.id");
  assert.match(fks[0].sql, /^ALTER TABLE sales ADD FOREIGN KEY \(customer_id\) REFERENCES customer \(id\);$/);
  assert.deepEqual(typeNotes(shop), ["product.price: money → numeric(12,2)", "sales.sale_date: datetime → timestamp"]);
  assert.match(countSql(shop), /SELECT 'customer' AS t, count\(\*\)::int AS n FROM customer\nUNION ALL/);
});

test("generateData is repeatable and fills every table", () => {
  const today = new Date(2026, 10, 10);
  const a = generateData(shop, { rows: 10, seed: 7, today }), b = generateData(shop, { rows: 10, seed: 7, today });
  assert.equal(a.sql, b.sql);
  assert.notEqual(a.sql, generateData(shop, { rows: 10, seed: 8, today }).sql);
  assert.deepEqual(a.counts, { customer: 10, product: 10, sales: 40 });
  // Parents come before children.
  assert.ok(a.sql.indexOf("INSERT INTO customer") < a.sql.indexOf("INSERT INTO sales"));
  assert.match(a.sql, /@example\.com/);
  assert.match(a.sql, /'(Coffee|Tea|Snacks|Bakery|Drinks|Household)'/);
});

// Read the generated INSERTs back into rows (good enough for the values this generator writes).
function rowsOf(sql, table) {
  const block = sql.split("\n\n").find((s) => s.startsWith(`INSERT INTO ${table} `));
  return block.split("\n").slice(1).filter(Boolean).map((l) => l.trim().replace(/^\(|\)[,;]$/g, "").split(", "));
}

test("foreign keys point at real parents, and some parents have no children", () => {
  const { sql } = generateData(shop, { rows: 20, seed: 3 });
  const customers = new Set(rowsOf(sql, "customer").map((r) => r[0]));
  const used = new Set(rowsOf(sql, "sales").map((r) => r[1]));
  for (const id of used) assert.ok(customers.has(id), `sales.customer_id ${id} has no customer`);
  assert.ok(used.size < customers.size, "every customer has sales, so 'customers with no sales' would be empty");
  assert.ok(used.size >= customers.size * 0.5);
  const emails = rowsOf(sql, "customer").map((r) => r[2]);
  assert.equal(new Set(emails).size, emails.length);
});

test("dates spread over about three years before today", () => {
  const today = new Date(2026, 10, 10);
  const { sql } = generateData(shop, { rows: 40, seed: 1, today });
  const years = rowsOf(sql, "sales").map((r) => r[4]).filter((d) => d !== "NULL").map((d) => +d.slice(1, 5));
  assert.ok(Math.min(...years) <= 2024 && Math.max(...years) === 2026, years.join(","));
});

test("composite keys, unique FKs, self references and odd types still give valid rows", () => {
  const t = fromModel(fromCompact({ tables: [
    { n: "employee", cols: [{ n: "id", t: "uuid", pk: true }, { n: "full_name", t: "text" }, { n: "manager_id", t: "uuid", ref: "employee.id" }, { n: "code", t: "char(3)", u: true, nul: false }] },
    { n: "badge", cols: [{ n: "employee_id", t: "uuid", pk: true, ref: "employee.id" }, { n: "issued", t: "date" }] },
    { n: "skill", cols: [{ n: "name", t: "varchar(10)", pk: true }] },
    { n: "employee_skill", cols: [{ n: "employee_id", t: "uuid", pk: true, ref: "employee.id" }, { n: "skill_name", t: "varchar(10)", pk: true, ref: "skill.name" }, { n: "level", t: "smallint" }] },
    { n: "mismatch", cols: [{ n: "id", t: "int", pk: true }, { n: "emp", t: "integer", ref: "employee.id" }] }
  ] })).tables;
  const { sql, counts } = generateData(t, { rows: 8, seed: 2 });
  const pairs = rowsOf(sql, "employee_skill").map((r) => r[0] + r[1]);
  assert.equal(new Set(pairs).size, pairs.length);
  const badges = rowsOf(sql, "badge").map((r) => r[0]);
  assert.equal(new Set(badges).size, badges.length);
  assert.ok(counts.badge <= counts.employee);
  for (const r of rowsOf(sql, "skill")) assert.ok(r[0].length - 2 <= 10, r[0]);
  for (const r of rowsOf(sql, "employee")) assert.ok(r[3].length - 2 <= 3, r[3]);
  for (const r of rowsOf(sql, "mismatch")) assert.match(r[1], /^(\d+|NULL)$/);
});

test("results compare by fingerprint, in order only when the query sorts", () => {
  const res = (rows, columns = ["id", "name"]) => ({ columns, rows, rowCount: rows.length, hash: digest(rows), hashSorted: digest(sortRows(rows)) });
  const rows = [["1", "Anna"], ["2", "Ben"], ["3", null]];
  const exp = snapshot(res(rows), "select id, name from customer");
  assert.equal(exp.ordered, false);
  assert.ok(compare(exp, res([...rows].reverse())).pass);
  const r1 = compare(exp, res([["1", "Anna"], ["2", "Bob"], ["3", null]]));
  assert.equal(r1.pass, false);
  assert.match(r1.reason, /Same number of rows/);
  assert.match(r1.reason, /Missing: \(2, Ben\)\. New: \(2, Bob\)\./);
  assert.match(compare(exp, res(rows.slice(0, 2))).reason, /^Expected 3 rows, got 2\. Missing: \(3, NULL\)\./);
  assert.match(compare(exp, res(rows, ["id", "full_name"])).reason, /^Columns changed: expected id, name; got id, full_name\./);

  const ord = snapshot(res(rows), "select * from customer order by id");
  assert.equal(ord.ordered, true);
  assert.match(compare(ord, res([...rows].reverse())).reason, /Row 1: expected \(1, Anna\), got \(3, NULL\)\./);
  assert.equal(isOrdered("select count(*) over (order by id) from t"), false);
  assert.equal(isOrdered("select 'order by' from t"), false);
});

test("txControl spots transaction statements, cleanTests keeps good tests", () => {
  assert.equal(txControl("BEGIN; delete from t;"), "BEGIN");
  assert.equal(txControl("select case when a then 1 end from t"), null);
  assert.equal(txControl("update t set a = 1;\ncommit;"), "COMMIT");
  assert.equal(txControl("select 'commit;'"), null);
  const good = { id: "x", name: "n", sql: "select 1", expected: { columns: ["a"], rowCount: 1, hash: "h", sample: [["1"]] } };
  const out = cleanTests([good, { ...good, sql: "" }, { ...good, expected: { ...good.expected, sample: [[1]] } }, "junk"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].expected.ordered, false);
  assert.deepEqual(cleanTests(null), []);
});

test("cleanMock keeps a saved mock database's settings safe", async () => {
  const { cleanMock, defaultMock } = await import("../js/mock/saved.js");
  assert.deepEqual(cleanMock(null), defaultMock());
  const m = cleanMock({ rows: 9999, seed: -1, data: "INSERT 1", edited: 1, query: 5, tests: [{ sql: "x" }] });
  assert.equal(m.rows, 20); assert.equal(m.seed, 1); assert.equal(m.data, "INSERT 1");
  assert.equal(m.edited, true); assert.equal(m.query, ""); assert.deepEqual(m.tests, []);
});
