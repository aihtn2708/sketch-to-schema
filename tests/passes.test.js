import { test } from "node:test";
import assert from "node:assert/strict";
import { runPasses, MAX_PASSES, INCOMPLETE_WARNING } from "../js/providers/passes.js";
import { salvageTables, mergeTables, continuePrompt, PROMPT } from "../js/providers/prompt.js";
import { postJson, without, capTokens } from "../js/providers/http.js";

const table = (n, cols = ["id"]) => ({ n, cols: cols.map((c) => ({ n: c, t: "integer" })) });
const reply = (tables) => JSON.stringify({ tables, warnings: [] });
// A reply cut off part-way through the last table.
const cut = (tables) => { const s = reply(tables); return s.slice(0, s.lastIndexOf('"n"') + 6); };

test("salvageTables keeps only the tables that were complete before the cut", () => {
  const t = cut([table("users", ["id", "email"]), table("posts"), table("comments", ["id", "body"])]);
  assert.deepEqual(salvageTables(t).map((x) => x.n), ["users", "posts"]);
  assert.deepEqual(salvageTables('```json\n{"tables":[{"n":"a","cols":[{"n":"id"}]},{"n":"b","co'), [{ n: "a", cols: [{ n: "id" }] }]);
  assert.deepEqual(salvageTables('{"tables":[{"n":"a","cols":[{"n":"x"'), []);
  assert.deepEqual(salvageTables("no json"), []);
});

test("salvageTables isn't fooled by braces inside names or notes", () => {
  const t = '{"tables":[{"n":"a","cols":[{"n":"id","flag":"name: looks like } or ]"}]},{"n":"b","cols":[{"n":"x\\"}';
  assert.deepEqual(salvageTables(t).map((x) => x.n), ["a"]);
});

test("mergeTables skips names already present, ignoring case", () => {
  const out = mergeTables([table("users")], [table("Users"), table("posts"), { bad: 1 }]);
  assert.deepEqual(out.map((t) => t.n), ["users", "posts"]);
});

test("continuePrompt lists what was already read", () => {
  const p = continuePrompt(["users", "posts"]);
  assert.ok(p.startsWith(PROMPT));
  assert.match(p, /already extracted: users, posts/);
});

test("a reply that fits is read in one pass", async () => {
  const out = await runPasses(async () => ({ text: reply([table("users")]), truncated: false }), { model: "m" });
  assert.deepEqual(out.result.tables.map((t) => t.n), ["users"]);
  assert.equal(out.parts, 1);
  assert.equal(out.incomplete, undefined);
});

test("a cut-off reply continues with only the missing tables", async () => {
  const prompts = [];
  const replies = [
    { text: cut([table("users"), table("posts"), table("comments")]), truncated: true },
    { text: reply([table("posts"), table("comments"), table("tags")]), truncated: false }
  ];
  const out = await runPasses(async (prompt) => { prompts.push(prompt); return replies.shift(); }, { model: "m" });
  assert.deepEqual(out.result.tables.map((t) => t.n), ["users", "posts", "comments", "tags"]);
  assert.equal(out.parts, 2);
  assert.match(prompts[1], /already extracted: users, posts/);
});

test("stops with a warning when every pass is cut off", async () => {
  let i = 0;
  const out = await runPasses(async () => ({ text: cut([table("t" + i++), table("t" + i++), table("x")]), truncated: true }), { model: "m" });
  assert.equal(out.parts, MAX_PASSES);
  assert.equal(out.incomplete, true);
  assert.equal(out.result.tables.length, MAX_PASSES * 2);
  assert.ok(out.result.warnings.includes(INCOMPLETE_WARNING));
});

test("a cut-off reply with no complete table explains what to do", async () => {
  await assert.rejects(runPasses(async () => ({ text: '{"tables":[{"n":"a","co', truncated: true }), { model: "m", label: "Gemini" }),
    /Gemini ran out of reply space/);
});

test("an unreadable first reply is an error; sticky follows the answering model", async () => {
  await assert.rejects(runPasses(async () => ({ text: "sorry", truncated: false }), { model: "m" }), /couldn't be read/);
  const asked = [];
  const replies = [{ text: cut([table("a"), table("b")]), truncated: true, model: "real/model" }, { text: reply([table("b")]), truncated: false, model: "real/model" }];
  const out = await runPasses(async (p, m) => { asked.push(m); return replies.shift(); }, { model: "openrouter/free", sticky: true });
  assert.deepEqual(asked, ["openrouter/free", "real/model"]);
  assert.equal(out.model, "real/model");
});

test("postJson drops an unsupported setting after a 400 and tries again", async () => {
  const bodies = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const b = JSON.parse(init.body); bodies.push(b);
    if ("reasoning_effort" in b) return new Response(JSON.stringify({ error: { message: "Unsupported parameter: 'reasoning_effort'" } }), { status: 400 });
    if (b.max_tokens > 8000) return new Response(JSON.stringify({ error: { message: "max_tokens is too large" } }), { status: 400 });
    return new Response("{}", { status: 200 });
  };
  try {
    const res = await postJson("https://x", {}, { max_tokens: 16000, reasoning_effort: "low", keep: 1 },
      { fallbacks: [capTokens("max_tokens", 8000), without("reasoning_effort")] });
    assert.equal(res.status, 200);
    assert.equal(bodies.length, 3);
    assert.deepEqual(bodies[2], { max_tokens: 8000, keep: 1 });
  } finally {
    globalThis.fetch = realFetch;
  }
});
