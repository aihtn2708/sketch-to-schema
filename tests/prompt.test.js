import { test } from "node:test";
import assert from "node:assert/strict";
import { parseJson, validShape, PROMPT, SCHEMA } from "../js/providers/prompt.js";

const body = '{"tables":[{"n":"a","cols":[{"n":"id"}]}],"warnings":[]}';

test("parseJson reads plain JSON, fenced JSON and JSON wrapped in a sentence", () => {
  assert.deepEqual(parseJson(body).tables[0].n, "a");
  assert.equal(parseJson("```json\n" + body + "\n```").tables[0].n, "a");
  assert.equal(parseJson("Here you go: " + body + " Hope it helps.").tables[0].n, "a");
  assert.equal(parseJson("no json here"), null);
});

test("validShape accepts the expected shape and rejects others", () => {
  assert.equal(validShape(JSON.parse(body)), true);
  assert.equal(validShape({ tables: [{ n: "a" }] }), false);
  assert.equal(validShape({ tables: [{ n: "a", cols: [{ name: "id" }] }] }), false);
  assert.equal(validShape(null), false);
});

test("the prompt's example only uses keys the JSON schema knows", () => {
  const example = JSON.parse(PROMPT.split("\n").find((l) => l.startsWith('{"tables"')));
  const colKeys = Object.keys(SCHEMA.properties.tables.items.properties.cols.items.properties);
  for (const col of example.tables[0].cols) {
    for (const k of Object.keys(col)) assert.ok(colKeys.includes(k), k);
    assert.equal(typeof col.n, "string"); assert.equal(typeof col.t, "string");
  }
});
