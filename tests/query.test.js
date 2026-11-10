import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCompact, fromModel } from "../js/schema/model.js";
import { schemaText, schemaKey, askPrompt, normalizeAnswer, normalizeVenn, cleanQueries, suggestions, sameQuestion, ASK_SCHEMA } from "../js/query/prompt.js";
import { checkSql } from "../js/query/check.js";
import { joinLabel, vennSvg } from "../js/query/venn.js";

const tables = fromModel(fromCompact({ tables: [
  { n: "inventory_items", cols: [{ n: "id", t: "integer", pk: true }, { n: "sku", t: "varchar(50)", u: true, nul: false }, { n: "name", t: "text" }] },
  { n: "inventory_transactions", cols: [{ n: "id", t: "integer", pk: true }, { n: "item_id", t: "integer", nul: false, ref: "inventory_items.id" }, { n: "created_at", t: "timestamp" }] }
] })).tables;

test("schemaText lists every table with types, keys and references", () => {
  const s = schemaText(tables);
  assert.equal(s.split("\n").length, 2);
  assert.match(s, /^inventory_items\(id integer PK, sku varchar\(50\) UNIQUE NOT NULL, name text\)/);
  assert.match(s, /item_id integer NOT NULL → inventory_items\.id/);
  assert.equal(schemaKey(s), schemaKey(s));
  assert.notEqual(schemaKey(s), schemaKey(s + " "));
});

test("askPrompt carries the schema, dialect, date and question", () => {
  const p = askPrompt({ schema: schemaText(tables), question: "items with no transactions", dialect: "mysql", today: "2026-11-10" });
  assert.match(p, /You write MySQL SQL/);
  assert.match(p, /inventory_transactions\(/);
  assert.match(p, /Today is 2026-11-10/);
  assert.match(p, /Question: items with no transactions/);
  // The example in the prompt matches what Claude's schema enforces.
  const example = JSON.parse(p.split("\n").find((l) => l.startsWith('{"sql"')));
  assert.deepEqual(Object.keys(example).sort(), [...ASK_SCHEMA.required].sort());
  assert.ok(normalizeAnswer(example));
});

test("normalizeAnswer keeps usable answers and drops broken ones", () => {
  const a = normalizeAnswer({ sql: " SELECT 1 ", explanation: "x", venn: { sets: [{ label: "A", table: "t" }, { label: "B" }], result: ["A", "zz"] }, assumptions: ["one", 2], missing: [] });
  assert.equal(a.sql, "SELECT 1");
  assert.deepEqual(a.venn.result, ["a"]);
  assert.deepEqual(a.assumptions, ["one"]);
  assert.equal(normalizeAnswer({ sql: "", missing: [] }), null);
  assert.ok(normalizeAnswer({ sql: "", missing: ["no price column"] }));
  assert.equal(normalizeAnswer("nope"), null);
  assert.equal(normalizeVenn({ sets: [{ label: "only one" }], result: ["a"] }), null);
  assert.equal(normalizeVenn({ sets: [], result: [] }), null);
});

test("cleanQueries keeps valid history entries, at most 30", () => {
  const good = { id: "1", question: "q", dialect: "postgresql", answer: { sql: "SELECT 1" }, at: 5 };
  const out = cleanQueries([good, { question: "", answer: { sql: "x" } }, { question: "q2", answer: null }, ...Array(40).fill(good)]);
  assert.equal(out.length, 30);
  assert.equal(out[0].dialect, "postgresql");
  assert.deepEqual(cleanQueries("x"), []);
});

test("suggestions come from the schema's relationships", () => {
  const s = suggestions(tables);
  assert.equal(s[0], "Inventory items with no inventory transactions in the past year");
  assert.equal(s[1], "Number of inventory transactions per inventory item");
  assert.equal(suggestions([]).length, 0);
  assert.ok(sameQuestion("  Items  with no X ", "items with no x"));
});

test("checkSql finds tables and columns that aren't in the schema", () => {
  const ok = `SELECT i.id, i.name FROM inventory_items i
WHERE NOT EXISTS (SELECT 1 FROM inventory_transactions AS t WHERE t.item_id = i.id AND t.created_at >= CURRENT_DATE - INTERVAL '2 years')`;
  assert.deepEqual(checkSql(ok, tables), { unknownTables: [], unknownColumns: [] });
  const bad = `SELECT i.qty_on_hand FROM inventory_items i JOIN warehouses w ON w.id = i.warehouse_id`;
  const r = checkSql(bad, tables);
  assert.deepEqual(r.unknownTables, ["warehouses"]);
  assert.deepEqual(r.unknownColumns.sort(), ["inventory_items.qty_on_hand", "inventory_items.warehouse_id"]);
});

test("checkSql ignores CTEs, subqueries, functions and strings", () => {
  const sql = `WITH recent AS (SELECT t.item_id FROM inventory_transactions t WHERE EXTRACT(YEAR FROM t.created_at) = 2026)
SELECT i.sku, r.whatever, 'from nowhere.x' AS note FROM inventory_items i
LEFT JOIN recent r ON r.item_id = i.id
LEFT JOIN (SELECT item_id FROM inventory_transactions) AS s ON s.item_id = i.id
WHERE i.name IS DISTINCT FROM 'x'`;
  assert.deepEqual(checkSql(sql, tables), { unknownTables: [], unknownColumns: [] });
});

test("joinLabel names the join for each 2-set region choice", () => {
  const v = (result) => ({ sets: [{ label: "A" }, { label: "B" }], result });
  assert.match(joinLabel(v(["a"])).sql, /NOT EXISTS/);
  assert.match(joinLabel(v(["ab"])).sql, /INNER JOIN/);
  assert.match(joinLabel(v(["ab", "a"])).sql, /LEFT JOIN/);
  assert.match(joinLabel(v(["a", "b", "ab"])).sql, /FULL OUTER JOIN/);
  assert.match(joinLabel({ sets: [{ label: "A" }, { label: "B" }, { label: "C" }], result: ["abc"] }).title, /in all 3/);
});

test("vennSvg shades only the result regions", () => {
  const svg = vennSvg({ sets: [{ label: "Items" }, { label: "Sold <2y>" }], result: ["a"] }, { accent: "#0a0", ink: "#111" });
  assert.equal((svg.match(/fill-opacity="0.45"/g) || []).length, 1);
  assert.match(svg, /clip-path="url\(#vn-in-a\)"/);
  assert.match(svg, /mask="url\(#vn-out-b\)"/);
  assert.match(svg, /Sold &lt;2y&gt;/);
  const three = vennSvg({ sets: [{ label: "A" }, { label: "B" }, { label: "C" }], result: ["ab", "abc"] }, { accent: "#0a0", ink: "#111" });
  assert.equal((three.match(/<circle[^>]*fill="none"/g) || []).length, 3);
});
