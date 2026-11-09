import { test } from "node:test";
import assert from "node:assert/strict";
import { fromCompact, fromModel } from "../js/schema/model.js";
import { tableSize, relations, autoLayout, placeMissing, edgeGeometry, bounds, cleanPositions, HEAD_H, ROW_H, MIN_W } from "../js/diagram/layout.js";

const measure = (text) => text.length * 8;   // stand-in for canvas text measuring
const draft = () => fromModel(fromCompact({ tables: [
  { n: "orders", cols: [{ n: "id", pk: true }, { n: "customer_id", ref: "customers.id" }, { n: "product_id", ref: "products.id" }] },
  { n: "customers", cols: [{ n: "id", pk: true }, { n: "email" }] },
  { n: "products", cols: [{ n: "id", pk: true }] },
  { n: "notes", cols: [{ n: "id" }] }
] })).tables;
const sizesOf = (tables) => Object.fromEntries(tables.map((t) => [t.id, tableSize(t, measure)]));
const byName = (tables, name) => tables.find((t) => t.name === name);

test("card size fits the longest row and grows with columns", () => {
  const t = draft();
  const s = tableSize(t[0], measure);
  assert.equal(s.h, HEAD_H + 3 * ROW_H);
  assert.ok(s.w >= MIN_W);
  const long = { name: "x", columns: [{ name: "a_really_long_column_name_here", type: "timestamp with time zone" }] };
  assert.ok(tableSize(long, measure).w > MIN_W);
});

test("relations link the referencing column to the referenced one", () => {
  const t = draft();
  const rels = relations(t);
  assert.equal(rels.length, 2);
  assert.equal(rels[0].from.t, byName(t, "orders").id);
  assert.equal(rels[0].from.i, 1);
  assert.equal(rels[0].to.t, byName(t, "customers").id);
  assert.equal(rels[0].to.i, 0);
});

test("auto layout puts referenced tables left of the tables that point at them", () => {
  const t = draft(), sizes = sizesOf(t), pos = autoLayout(t, sizes);
  assert.ok(pos[byName(t, "customers").id].x < pos[byName(t, "orders").id].x);
  assert.ok(pos[byName(t, "products").id].x < pos[byName(t, "orders").id].x);
  // Tables in the same column don't overlap.
  const c = pos[byName(t, "customers").id], p = pos[byName(t, "products").id];
  if (c.x === p.x) assert.ok(Math.abs(c.y - p.y) >= Math.min(sizes[byName(t, "customers").id].h, sizes[byName(t, "products").id].h));
});

test("a cycle of references still lays out", () => {
  const t = fromModel(fromCompact({ tables: [
    { n: "a", cols: [{ n: "id", pk: true }, { n: "b_id", ref: "b.id" }] },
    { n: "b", cols: [{ n: "id", pk: true }, { n: "a_id", ref: "a.id" }] }
  ] })).tables;
  const pos = autoLayout(t, sizesOf(t));
  assert.equal(Object.keys(pos).length, 2);
});

test("new tables are placed to the right of tables that already have a position", () => {
  const t = draft(), sizes = sizesOf(t);
  const kept = { [t[0].id]: { x: 500, y: 100 } };
  const pos = placeMissing(t, sizes, kept);
  assert.deepEqual(pos[t[0].id], { x: 500, y: 100 });
  for (const other of t.slice(1)) assert.ok(pos[other.id].x > 500 + sizes[t[0].id].w);
});

test("connectors leave and enter on the facing sides", () => {
  const t = draft(), sizes = sizesOf(t), rel = relations(t)[0];
  const pos = { [rel.from.t]: { x: 600, y: 0 }, [rel.to.t]: { x: 0, y: 0 } };
  const g = edgeGeometry(rel, pos, sizes);
  assert.equal(g.a.x, 600);                       // left side of orders
  assert.equal(g.b.x, sizes[rel.to.t].w);         // right side of customers
  assert.equal(g.a.y, HEAD_H + ROW_H * 1.5);      // the customer_id row
  assert.match(g.d, /^M600,/);
});

test("bounds and cleanPositions", () => {
  const t = draft(), sizes = sizesOf(t), pos = autoLayout(t, sizes);
  const b = bounds(t, pos, sizes);
  assert.equal(b.x0, 0); assert.equal(b.y0, 0);
  assert.equal(bounds([], {}, {}), null);
  assert.deepEqual(cleanPositions({ a: { x: 1, y: 2 }, b: { x: "1", y: 2 }, c: null }), { a: { x: 1, y: 2 } });
  assert.deepEqual(cleanPositions("nope"), {});
});
