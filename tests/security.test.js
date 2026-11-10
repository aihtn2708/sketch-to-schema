// Security checks: hostile project files, CSV injection, slow-regex input.
import { test } from "node:test";
import assert from "node:assert/strict";
import { esc, safeId } from "../js/util.js";
import { cleanDraft, cleanOriginal, normFlags } from "../js/schema/model.js";
import { cleanPositions } from "../js/diagram/layout.js";
import { cleanShapes } from "../js/sketch/shapes.js";
import { cleanTables, toCsv, typeProblem } from "../js/mock/rows.js";
import { cleanQueries } from "../js/query/prompt.js";
import { cleanTests } from "../js/mock/compare.js";

const EVIL = '"><img src=x onerror=alert(1)>';

test("esc covers every character that matters in HTML text and attributes", () => {
  assert.equal(esc(`<a href="x" title='y'>&</a>`), "&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
});

test("safeId keeps plain ids, maps anything else to a stable plain id", () => {
  assert.equal(safeId("t_1-abc"), "t_1-abc");
  for (const bad of [EVIL, "__proto__", "constructor", "a b", "", "x".repeat(65)]) {
    const s = safeId(bad);
    assert.match(s, /^[A-Za-z0-9_-]{1,64}$/);
    assert.notEqual(s, bad);
    assert.equal(safeId(bad), s, "the same input must give the same id");
  }
  assert.notEqual(safeId("a b"), safeId("a c"));
});

test("an imported draft can't carry markup in ids, and references still line up", () => {
  const [t1, t2] = cleanDraft([
    { id: EVIL, name: "customer", columns: [{ id: EVIL + "c", name: "id", pk: true }] },
    { id: "t2", name: "sales", columns: [{ id: "c2", name: "customer_id", ref: { t: EVIL, c: EVIL + "c" } }] }
  ]);
  assert.match(t1.id, /^[A-Za-z0-9_-]+$/);
  assert.match(t1.columns[0].id, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(t2.columns[0].ref, { t: t1.id, c: t1.columns[0].id });
  assert.equal(cleanDraft([{ name: "x".repeat(5000) }])[0].name.length, 200);
});

test("flags only use real field names (not constructor, __proto__, ...)", () => {
  assert.deepEqual(normFlags([{ field: "constructor", note: "x" }, { field: "__proto__", note: "x" }, { field: "type", note: "ok" }]), [{ field: "type", note: "ok" }]);
});

test("saved objects keyed by id can't replace their prototype", () => {
  const pos = cleanPositions(JSON.parse('{"__proto__": {"x": 1, "y": 2}, "a": {"x": 3, "y": 4}}'));
  assert.equal(Object.getPrototypeOf(pos), Object.prototype);
  assert.equal(pos.a.x, 3);
  const tables = cleanTables(JSON.parse('{"__proto__": {"name": "t", "cols": [{"id": "c", "name": "x"}], "rows": [["1"]]}}'));
  assert.equal(Object.getPrototypeOf(tables), Object.prototype);
  assert.equal(Object.keys(tables).length, 1);
  const orig = cleanOriginal(JSON.parse('{"__proto__": {"name": "x"}, "t1": {"name": "a", "evil": {"deep": 1}}}'));
  assert.equal(Object.getPrototypeOf(orig), Object.prototype);
  assert.deepEqual(orig.t1, { name: "a" });
});

test("imported history, tests and drawings are reduced to known fields", () => {
  const q = cleanQueries([{ id: EVIL, question: "q", answer: { sql: "select 1" } }]);
  assert.match(q[0].id, /^[A-Za-z0-9_-]+$/);
  const t = cleanTests([{ id: EVIL, sql: "select 1", expected: { columns: ["a"], rowCount: 1, hash: "h", sample: [["1"]] } }]);
  assert.match(t[0].id, /^[A-Za-z0-9_-]+$/);
  const shapes = cleanShapes([{ type: "text", x: 1, y: 2, text: "hi", size: 30, onclick: "x", extra: { a: 1 } }, { type: "box", x1: 0, y1: 0, x2: 1, y2: 1, html: EVIL }]);
  assert.deepEqual(shapes, [{ type: "text", x: 1, y: 2, text: "hi", size: 30 }, { type: "box", x1: 0, y1: 0, x2: 1, y2: 1 }]);
});

test("CSV export keeps formulas as text (CSV injection) but leaves numbers alone", () => {
  const csv = toCsv(["v"], [["=HYPERLINK(\"http://x\")"], ["+1+1"], ["@SUM(A1)"], ["-2+3"], ["-5"], ["-1.25"], ["\tx"], ["plain"]]);
  assert.deepEqual(csv.trim().split("\r\n").slice(1), ['"\'=HYPERLINK(""http://x"")"', "'+1+1", "'@SUM(A1)", "'-2+3", "-5", "-1.25", "'\tx", "plain"]);
});

test("number checks stay fast on very long input (no catastrophic backtracking)", () => {
  const t0 = Date.now();
  typeProblem("numeric(12,2)", "1".repeat(50000) + "x");
  typeProblem("integer", "9".repeat(50000) + "!");
  assert.ok(Date.now() - t0 < 200, `took ${Date.now() - t0} ms`);
});
