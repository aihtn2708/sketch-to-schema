import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCompact, fromModel, snapshotOf, draftStats, cleanDraft, colById } from "../js/schema/model.js";

const REPLY = {
  tables: [
    { n: "users", cols: [{ n: "id", t: "integer", g: true, pk: true, nul: false, u: false, ref: "", flag: "" }] },
    { n: "posts", cols: [
      { n: "id", t: "integer", g: true, pk: true, nul: false, u: false, ref: "", flag: "" },
      { n: "user_id", t: "integer", g: true, pk: false, nul: false, u: false, ref: "users.id", flag: "ref: line end unclear" },
      { n: "author", t: "integer", g: false, pk: false, nul: true, u: false, ref: "people.id", flag: "" }
    ] }
  ],
  warnings: ["a note"]
};

test("compact reply becomes an editable draft with resolved references", () => {
  const d = fromModel(fromCompact(REPLY));
  assert.deepEqual(d.tables.map((t) => t.name), ["users", "posts"]);
  const userId = d.tables[1].columns[1];
  assert.equal(colById(d.tables, userId.ref.c).c.name, "id");
  assert.equal(colById(d.tables, userId.ref.c).t.name, "users");
  assert.deepEqual(userId.flags, [{ field: "references", note: "line end unclear" }]);
  assert.equal(d.tables[0].columns[0].typeGuessed, true);
  assert.deepEqual(d.warnings, ["a note"]);
});

test("a reference to a missing table is flagged, not dropped silently", () => {
  const d = fromModel(fromCompact(REPLY));
  const author = d.tables[1].columns[2];
  assert.equal(author.ref, null);
  assert.match(author.flags[0].note, /people\.id/);
});

test("a flag without a field name is kept as a name flag", () => {
  const d = fromModel(fromCompact({ tables: [{ n: "t", cols: [{ n: "x", t: "text", flag: "hard to read" }] }] }));
  assert.deepEqual(d.tables[0].columns[0].flags, [{ field: "name", note: "hard to read" }]);
});

test("primary keys default to not null; other columns to nullable", () => {
  const d = fromModel({ tables: [{ name: "t", columns: [{ name: "id", pk: true }, { name: "x" }] }] });
  assert.equal(d.tables[0].columns[0].nullable, false);
  assert.equal(d.tables[0].columns[1].nullable, true);
});

test("draftStats counts open flags and the share of fields kept", () => {
  const d = fromModel(fromCompact(REPLY));
  const original = snapshotOf(d.tables);
  assert.equal(draftStats(d.tables, original).keptPct, 100);
  d.tables[0].columns[0].type = "bigint";
  const s = draftStats(d.tables, original);
  assert.ok(s.keptPct < 100);
  assert.equal(s.flags, 2);
  assert.equal(s.cols, 4);
});

test("cleanDraft keeps known fields and drops anything else", () => {
  const out = cleanDraft([{ id: "a", name: "t", evil: "<script>", columns: [{ id: "c", name: 5, ref: { t: 1 }, flags: [{ field: "bogus", note: "x" }] }] }]);
  assert.deepEqual(Object.keys(out[0]).sort(), ["columns", "flags", "id", "name"]);
  assert.equal(out[0].columns[0].name, "5");
  assert.equal(out[0].columns[0].ref, null);
  assert.deepEqual(out[0].columns[0].flags, []);
  assert.deepEqual(cleanDraft("not a list"), []);
});
