// The "Test on mock data" panel: a PostgreSQL database built from the draft schema plus sample
// data, a query editor with results, and saved tests. Nothing here makes an AI request.
//
// The database is built on first use and rebuilt whenever the schema or the sample data
// changes. Every query runs inside a transaction that is rolled back, so the data never drifts.
import { $, esc, uid } from "../util.js";
import { state, on, emit } from "../state.js";
import { schemaKey, DIALECTS } from "../query/prompt.js";
import { createSql, fkSteps, typeNotes, countSql } from "./setup.js";
import { generateData } from "./generate.js";
import { snapshot, compare, txControl } from "./compare.js";
import * as db from "./db.js";

const M = () => state.mock;
const sqlEl = $("#mockSql"), dataEl = $("#mockData"), resultEl = $("#mockResult");
const SHOW_ROWS = 500;          // rows drawn in the results table
let tab = "query";
let last = null;                // { sql, result, title } of the last successful run
let info = null;                // { counts, warnings } from the last build
let phase = "idle";             // idle | building | ready | error
let buildError = null;
let pendingName = "";           // test name suggested by Ask ("Run on mock data")
let undoGen = null;             // sample data before the last "New sample data"
let testRuns = new Set();       // ids of tests running now
let started = false;            // the engine has been downloaded and started once this visit
let running = false;            // a query or test is running

const plural = (n, word) => `${n.toLocaleString()} ${word}${n === 1 ? "" : "s"}`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const dirtySoon = debounce(() => emit("dirty"), 500);

function msg(el, text, isErr = false) {
  el.hidden = !text; el.textContent = text || ""; el.classList.toggle("err", isErr);
}

/* ---------- Schema, data and database ---------- */
function setup() {
  const tables = state.schema.tables.filter((t) => t.columns.length);
  const create = createSql(tables), fks = fkSteps(tables);
  return { tables, create, fks, key: schemaKey(create + "\n" + fks.map((f) => f.sql).join("\n")) };
}
const dbKey = (s) => schemaKey(s.key + "\n" + M().data);

function generate(s, newSeed) {
  if (newSeed) M().seed = (M().seed % 999999) + 1;
  M().data = generateData(s.tables, { rows: M().rows, seed: M().seed }).sql;
  M().dataSchema = s.key;
  M().edited = false;
  emit("dirty");
}

// Sample data follows the draft automatically until someone edits it by hand.
function ensureData(s = setup()) {
  if (!s.tables.length) return;
  if (!M().data.trim() || (M().dataSchema !== s.key && !M().edited)) generate(s, false);
}

async function ensureDb() {
  const s = setup();
  if (!s.tables.length) throw { message: "Add tables to the draft schema first. The mock database is built from it.", label: "empty" };
  ensureData(s);
  const key = dbKey(s);
  if (db.isBuilt(key) && phase === "ready") return;
  phase = "building"; buildError = null; renderStatus();
  try {
    info = await db.build(key, [
      { sql: s.create, label: "schema" },
      { sql: M().data, label: "data" },
      ...s.fks.map((f) => ({ sql: f.sql, label: f.label, soft: true }))
    ], countSql(s.tables));
    phase = "ready"; started = true;
  } catch (e) {
    info = null;
    phase = e?.stopped ? "idle" : "error";
    buildError = e?.stopped ? null : e;
    throw e;
  } finally { renderStatus(); renderTables(); renderDataNote(); }
}

// "Line 3: column "x" does not exist", with where it happened.
function errText(e, sql) {
  if (!e) return "Something went wrong.";
  if (e.stopped) return "Stopped. The database restarts on the next run.";
  let line = "";
  const src = e.label === "data" ? M().data : e.label === "query" ? sql : "";
  if (e.position && src) line = `line ${src.slice(0, e.position - 1).split("\n").length}: `;
  const where = e.label === "data" ? "Sample data, " : e.label === "schema" ? "Creating the tables: " : line ? "Query, " : "";
  return `${where}${line}${e.message}`.replace(/^(.)/, (c) => c.toUpperCase());
}

/* ---------- Rendering ---------- */
function renderStatus() {
  const dot = $("#dbDot"), s = setup();
  const built = s.tables.length && db.isBuilt(dbKey(s));
  let text;
  dot.className = "dot";
  if (!s.tables.length) text = "No tables yet. Add tables to the draft schema first.";
  else if (phase === "building") { dot.classList.add("busy"); text = started ? "Building the database…" : "Starting PostgreSQL and loading the sample data…"; }
  else if (phase === "error") { dot.classList.add("err"); text = "Couldn't build the database. See the message below."; }
  else if (phase === "ready" && built) {
    dot.classList.add("on");
    const rows = (info?.counts || []).reduce((n, r) => n + r.n, 0);
    text = `Ready · ${plural(info?.counts?.length || 0, "table")} · ${plural(rows, "row")}`;
    if (info?.warnings?.length) text += ` · ${plural(info.warnings.length, "relationship")} not enforced`;
  } else if (phase === "ready") text = "Out of date. Rebuilds on the next run.";
  else if (started) text = "Stopped. Starts again on the next run.";
  else text = "Not started. Starts on your first run (the first time downloads about 5 MB).";
  $("#dbText").textContent = text;
  $("#dbText").title = info?.warnings?.map((w) => `${w.label}: ${w.message}`).join("\n") || "";
}

function renderTables() {
  const s = setup();
  const counts = new Map((phase === "ready" && db.isBuilt(dbKey(s)) ? info?.counts || [] : []).map((r) => [r.t, r.n]));
  $("#mockTables").innerHTML = s.tables.length
    ? s.tables.map((t) => {
      const name = t.name.trim() || "untitled_table", n = counts.get(name);
      return `<li><button type="button" data-t="${esc(name)}" title="Show the rows in ${esc(name)}"><span class="tn">${esc(name)}</span><span class="tc">${n === undefined ? "" : plural(n, "row")}</span></button></li>`;
    }).join("")
    : `<li class="hint">None yet.</li>`;
}

function renderDataNote() {
  const s = setup(), note = $("#dataNote");
  const warn = [];
  if (M().edited && M().dataSchema && M().dataSchema !== s.key) warn.push("The draft schema changed after this data was edited. Press New sample data to start again from the draft, or update the INSERT statements to match.");
  if (phase === "error" && buildError?.label === "data") warn.push(errText(buildError));
  for (const w of info?.warnings || []) warn.push(`Relationship ${w.label} isn't enforced: ${w.message}.`);
  note.hidden = !warn.length;
  note.innerHTML = warn.map(esc).join("<br>");
}

function renderData() {
  const s = setup();
  if (dataEl.value !== M().data) dataEl.value = M().data;
  const notes = typeNotes(s.tables);
  $("#typeNotes").innerHTML = notes.length ? `<li class="lh">Types changed to run on PostgreSQL:</li>${notes.map((n) => `<li><code>${esc(n)}</code></li>`).join("")}` : "";
  $("#mockSetup").textContent = s.tables.length
    ? `${s.create}\n\n-- Then the sample data, then:\n${s.fks.map((f) => f.sql).join("\n") || "-- (no relationships)"}`
    : "-- No tables yet.";
  renderDataNote();
}

function renderResult(r, title = "") {
  const meta = [];
  if (title) meta.push(`<b>${esc(title)}</b>`);
  if (r.columns.length) meta.push(`<b>${plural(r.rowCount, "row")}</b>`);
  else meta.push(`<b>${esc(r.command || "Done")}${r.affected ? ` · ${plural(r.affected, "row")} changed, then undone` : ""}</b>`);
  meta.push(`${r.ms} ms`);
  if (r.statements > 1) meta.push(`${r.statements} statements, showing the last result`);
  if (r.rows.length < r.rowCount || r.rowCount > SHOW_ROWS) meta.push(`showing the first ${Math.min(SHOW_ROWS, r.rows.length).toLocaleString()}`);
  let html = `<div class="res-meta">${meta.map((m) => `<span>${m}</span>`).join("")}</div>`;
  if (r.columns.length) {
    const rows = r.rows.slice(0, SHOW_ROWS);
    html += `<div class="res-wrap" tabindex="0" aria-label="Query results"><table class="res"><thead><tr><th class="n">#</th>${r.columns.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${
      rows.map((row, i) => `<tr><td class="n">${i + 1}</td>${row.map((v) => (v === null ? `<td><span class="null">NULL</span></td>` : `<td title="${esc(v.length > 40 ? v : "")}">${esc(v)}</td>`)).join("")}</tr>`).join("")
    }</tbody></table></div>`;
    if (!r.rowCount) html += `<p class="hint">No rows. Try New sample data, or more rows per table, if you expected some.</p>`;
  }
  resultEl.innerHTML = html;
}

function renderError(e, sql) {
  resultEl.innerHTML = `<div class="err-box"><b>${esc(errText(e, sql))}</b>${e?.detail ? `<span>${esc(e.detail)}</span>` : ""}${e?.hint ? `<span class="hint">Hint: ${esc(e.hint)}</span>` : ""}</div>`;
}

function renderTests() {
  const tests = M().tests, s = setup(), key = s.tables.length ? dbKey(s) : "";
  $("#testCount").textContent = tests.length ? `(${tests.length})` : "";
  const pass = tests.filter((t) => t.last?.pass).length, fail = tests.filter((t) => t.last && !t.last.pass).length;
  $("#testsSummary").innerHTML = tests.length
    ? [pass && `<span class="pill ok">${pass} passed</span>`, fail && `<span class="pill fail">${fail} failed</span>`,
       tests.length - pass - fail && `<span class="pill">${tests.length - pass - fail} not run</span>`].filter(Boolean).join("")
    : "";
  $("#testsRun").disabled = running || !tests.length;
  $("#testsList").innerHTML = tests.length ? tests.map((t) => {
    const running = testRuns.has(t.id);
    const st = running ? `<span class="pill">Running…</span>` : !t.last ? `<span class="pill">Not run</span>`
      : t.last.pass ? `<span class="pill ok">Passed</span>` : `<span class="pill fail">Failed</span>`;
    const e = t.expected;
    const meta = [`expects ${e.columns.length ? plural(e.rowCount, "row") : esc(e.command || "no result")}`, e.ordered ? "in order" : "in any order"];
    if (t.dataKey && t.dataKey !== key) meta.push("saved with different sample data");
    return `<li class="test${t.last && !t.last.pass ? " fail" : ""}" data-id="${esc(t.id)}">
      <div class="test-top">${st}
        <input class="in test-name" value="${esc(t.name)}" aria-label="Test name" maxlength="200">
        <span class="test-acts">
          <button type="button" data-act="run"${running ? " disabled" : ""}>Run</button>
          <button type="button" data-act="open">Open</button>
          ${t.last && !t.last.pass ? `<button type="button" data-act="accept" title="Make the current result the expected one">Accept new result</button>` : ""}
          <button type="button" class="icon-btn" data-act="del" aria-label="Delete test “${esc(t.name)}”">×</button>
        </span></div>
      ${t.last && !t.last.pass ? `<p class="test-why">${esc(t.last.reason)}</p>` : ""}
      <pre class="test-sql">${esc(t.sql.trim())}</pre>
      <span class="test-meta">${meta.join(" · ")}</span></li>`;
  }).join("") : `<li class="empty">No tests yet. Run a query whose result looks right, then press Save as test. Run all tests later to check that nothing changed after you edit the schema, the data or the query.</li>`;
}

function showTab(name) {
  tab = name;
  for (const [id, t] of [["mtQuery", "query"], ["mtData", "data"], ["mtTests", "tests"]]) $("#" + id).setAttribute("aria-selected", String(t === name));
  $("#mvQuery").hidden = name !== "query"; $("#mvData").hidden = name !== "data"; $("#mvTests").hidden = name !== "tests";
  if (name === "data") { ensureData(); renderData(); }
  if (name === "tests") renderTests();
}

function renderAll() {
  $("#mockRows").value = M().rows;
  if (sqlEl.value !== M().query) sqlEl.value = M().query;
  renderStatus(); renderTables(); renderTests();
  if (tab === "data") renderData();
}

/* ---------- Running ---------- */
function setRunning(on) {
  running = on;
  $("#mockRun").disabled = on; $("#mockStop").hidden = !on; $("#testsRun").disabled = on || !M().tests.length;
}

async function runSql(sql) {
  const tx = txControl(sql);
  if (tx) throw { message: `Leave out ${tx}. Each run is already wrapped in a transaction that is undone afterwards.`, label: "tx" };
  await ensureDb();
  return db.run(sql);
}

async function runEditor({ title = "", sql = sqlEl.value } = {}) {
  if (!sql.trim()) { msg($("#mockMsg"), "Type a query first.", true); sqlEl.focus(); return null; }
  if (running) return null;
  setRunning(true); msg($("#mockMsg"), "");
  resultEl.innerHTML = `<p class="hint">Running…</p>`;
  try {
    const r = await runSql(sql);
    last = { sql, result: r, title };
    renderResult(r, title);
    return r;
  } catch (e) {
    last = null;
    renderError(e, sql);
    return null;
  } finally { setRunning(false); renderStatus(); }
}

async function runTest(t) {
  testRuns.add(t.id); renderTests();
  try {
    const r = await runSql(t.sql);
    const c = compare(t.expected, r);
    t.last = { pass: c.pass, reason: c.reason, at: Date.now() };
    return r;
  } catch (e) {
    t.last = { pass: false, reason: e?.stopped ? "Stopped." : `Error: ${errText(e, t.sql)}`, at: Date.now() };
    return null;
  } finally { testRuns.delete(t.id); }
}

async function runAllTests() {
  if (running || !M().tests.length) return;
  setRunning(true);
  try { for (const t of [...M().tests]) { await runTest(t); renderTests(); } }
  finally { setRunning(false); renderStatus(); renderTests(); emit("dirty"); }
}

async function saveTest() {
  const sql = sqlEl.value;
  const r = last && last.sql === sql && !last.preview ? last.result : await runEditor();
  if (!r) return;
  const flat = sql.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();
  const name = pendingName || (flat.length > 70 ? flat.slice(0, 70).replace(/\s+\S*$/, "") + " …" : flat) || "Untitled test";
  M().tests.unshift({ id: uid(), name, sql, dataKey: dbKey(setup()), at: Date.now(), expected: snapshot(r, sql), last: { pass: true, reason: "", at: Date.now() } });
  if (M().tests.length > 100) M().tests.length = 100;
  pendingName = "";
  emit("dirty"); renderTests();
  msg($("#mockMsg"), `Saved as a test: “${name}”. It expects ${r.columns.length ? plural(r.rowCount, "row") : "the same result"}. Open the Tests tab to run it again later.`);
}

/* ---------- Events ---------- */
$("#mockRun").addEventListener("click", () => runEditor());
$("#mockStop").addEventListener("click", () => { db.stop(); phase = "idle"; renderStatus(); renderTables(); });
$("#mockSave").addEventListener("click", saveTest);
$("#testsRun").addEventListener("click", runAllTests);
for (const [id, t] of [["mtQuery", "query"], ["mtData", "data"], ["mtTests", "tests"]]) $("#" + id).addEventListener("click", () => showTab(t));

sqlEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); runEditor(); }
  else if (e.key === "Tab" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    // Tab indents inside the editor (Esc then Tab moves focus on).
    if (sqlEl.dataset.esc) { delete sqlEl.dataset.esc; return; }
    e.preventDefault(); document.execCommand("insertText", false, "  ");
  } else if (e.key === "Escape") sqlEl.dataset.esc = "1";
});
sqlEl.addEventListener("input", () => { delete sqlEl.dataset.esc; M().query = sqlEl.value; pendingName = ""; dirtySoon(); });

dataEl.addEventListener("input", () => {
  M().data = dataEl.value; M().edited = true;
  dirtySoon(); renderStatus(); renderTables();
});

$("#mockRows").addEventListener("change", () => {
  const n = Math.round(Number($("#mockRows").value));
  M().rows = Number.isFinite(n) ? Math.min(500, Math.max(1, n)) : 20;
  $("#mockRows").value = M().rows;
  emit("dirty");
});

$("#mockGen").addEventListener("click", () => {
  const s = setup();
  if (!s.tables.length) { msg($("#mockGenMsg"), "Add tables to the draft schema first.", true); return; }
  undoGen = { data: M().data, seed: M().seed, edited: M().edited, dataSchema: M().dataSchema };
  generate(s, true);
  const counts = generateData(s.tables, { rows: M().rows, seed: M().seed }).counts;
  const m = $("#mockGenMsg");
  m.hidden = false; m.classList.remove("err");
  m.innerHTML = `New sample data: ${Object.entries(counts).map(([t, n]) => `${esc(t)} ${n}`).join(", ")}. ${M().tests.length ? "Tests still expect the old data, so some may fail. " : ""}<button type="button" class="quiet" id="mockUndo">Undo</button>`;
  renderAll(); if (tab === "data") renderData();
});
$("#mockGenMsg").addEventListener("click", (e) => {
  if (!e.target.closest("#mockUndo") || !undoGen) return;
  Object.assign(M(), undoGen); undoGen = null;
  msg($("#mockGenMsg"), "Sample data restored.");
  emit("dirty"); renderAll(); if (tab === "data") renderData();
});

// A table in the list: show its rows without touching the query being edited.
$("#mockTables").addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-t]");
  if (!b || running) return;
  const name = b.dataset.t, q = /^[a-z_][a-z0-9_]*$/.test(name) ? name : `"${name.replace(/"/g, '""')}"`;
  showTab("query");
  const r = await runEditor({ sql: `SELECT * FROM ${q} LIMIT 100;`, title: `${name}, first 100 rows` });
  if (last) last.preview = true;
  if (r) msg($("#mockMsg"), "");
});

$("#testsList").addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-id]"), act = e.target.closest("button[data-act]")?.dataset.act;
  if (!li || !act) return;
  const t = M().tests.find((x) => x.id === li.dataset.id);
  if (!t) return;
  if (act === "del") { M().tests = M().tests.filter((x) => x !== t); emit("dirty"); renderTests(); return; }
  if (act === "open") {
    sqlEl.value = M().query = t.sql; pendingName = t.name; emit("dirty");
    showTab("query"); sqlEl.focus(); runEditor();
    return;
  }
  if (running) return;
  setRunning(true);
  try {
    const r = await runTest(t);
    if (act === "accept" && r) {
      t.expected = snapshot(r, t.sql); t.dataKey = dbKey(setup());
      t.last = { pass: true, reason: "", at: Date.now() };
    }
  } finally { setRunning(false); renderStatus(); renderTests(); emit("dirty"); }
});
$("#testsList").addEventListener("change", (e) => {
  const input = e.target.closest(".test-name"), li = e.target.closest("li[data-id]");
  const t = li && M().tests.find((x) => x.id === li.dataset.id);
  if (input && t) { t.name = input.value.trim() || "Untitled test"; emit("dirty"); }
});

// From an Ask answer: put the SQL in the editor and run it.
on("mock:run", async ({ sql, name = "", dialect = "postgresql" }) => {
  sqlEl.value = M().query = sql; emit("dirty");
  showTab("query");
  $("#mockPanel").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  await runEditor();
  pendingName = name;
  if (dialect !== "postgresql") msg($("#mockMsg"), `This query was written for ${DIALECTS[dialect] || dialect}; the mock database is PostgreSQL, so some syntax may not run. Ask again with PostgreSQL selected if it fails.`);
});

const onDraft = debounce(() => {
  if (M().data || tab === "data") ensureData();
  renderStatus(); renderTables(); renderTests();
  if (tab === "data") renderData();
}, 300);
on("draft:replaced", onDraft);
on("draft:edited", onDraft);
on("project:loaded", () => {
  last = null; undoGen = null; pendingName = ""; testRuns = new Set();
  if (phase === "error") { phase = "idle"; buildError = null; }
  resultEl.innerHTML = ""; msg($("#mockMsg"), ""); msg($("#mockGenMsg"), "");
  renderAll();
});
renderAll();
