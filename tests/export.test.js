import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCompact, fromModel } from "../js/schema/model.js";
import { toDDL, toDBML } from "../js/schema/export.js";

const draft = () => fromModel(fromCompact({
  tables: [
    { n: "user", cols: [
      { n: "id", t: "integer", pk: true, nul: false },
      { n: "email", t: "varchar(255)", nul: false, u: true }
    ] },
    { n: "order_items", cols: [
      { n: "order_id", t: "integer", pk: true, nul: false },
      { n: "user_id", t: "integer", nul: false, ref: "user.id" },
      { n: "unit price", t: "numeric(10, 2)", nul: true }
    ] }
  ]
})).tables;

test("DDL: single key inline, composite key as a constraint, foreign keys last", () => {
  const sql = toDDL(draft());
  assert.match(sql, /CREATE TABLE "user" \(\n  id integer PRIMARY KEY,\n  email varchar\(255\) NOT NULL UNIQUE\n\);/);
  assert.match(sql, /CREATE TABLE order_items/);
  assert.match(sql, /ALTER TABLE order_items\n  ADD FOREIGN KEY \(user_id\) REFERENCES "user" \(id\);\n$/);
});

test("DDL quotes reserved words and names with spaces", () => {
  const sql = toDDL(draft());
  assert.match(sql, /"user"/);
  assert.match(sql, /"unit price" numeric\(10, 2\)/);
});

test("DDL with a composite key", () => {
  const t = draft();
  t[1].columns[1].pk = true;
  assert.match(toDDL(t), /PRIMARY KEY \(order_id, user_id\)/);
});

test("DBML: settings, references and composite keys", () => {
  const t = draft();
  const dbml = toDBML(t);
  assert.match(dbml, /Table user \{\n  id integer \[pk\]\n  email varchar\(255\) \[not null, unique\]\n\}/);
  assert.match(dbml, /user_id integer \[not null, ref: > user\.id\]/);
  assert.match(dbml, /"unit price" numeric\(10,2\)/);
  t[1].columns[1].pk = true;
  assert.match(toDBML(t), /indexes \{\n    \(order_id, user_id\) \[pk\]\n  \}/);
});

test("empty drafts give a comment instead of empty output", () => {
  assert.equal(toDDL([]), "-- No tables yet.");
  assert.equal(toDBML([]), "// No tables yet.");
});
