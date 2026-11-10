// The "Ask in plain language" panel: question → SQL (plus a Venn diagram for set questions),
// always grounded in the current draft schema. Answers are saved with the project; asking the
// same question again against the same schema replays the saved answer without a request.
import { $, esc, uid, store } from "../util.js";
import { state, on, emit } from "../state.js";
import { active } from "../connection.js";
import { parseJson } from "../providers/prompt.js";
import { DIALECTS, ASK_SCHEMA, schemaText, schemaKey, askPrompt, normalizeAnswer, sameQuestion, suggestions } from "./prompt.js";
import { checkSql } from "./check.js";
import { vennSvg, joinLabel } from "./venn.js";
import { svgIcon } from "../icons.js";

const input = $("#askInput"), dialectSel = $("#askDialect"), answerEl = $("#askAnswer");
let shownId = null;   // the history entry on display
let ctl = null;

dialectSel.innerHTML = Object.entries(DIALECTS).map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
dialectSel.value = DIALECTS[store.get("s2s.dialect")] ? store.get("s2s.dialect") : "postgresql";
dialectSel.addEventListener("change", () => store.set("s2s.dialect", dialectSel.value));

function askMsg(text, isErr = false) {
  const m = $("#askMsg");
  m.hidden = !text; m.textContent = text || ""; m.classList.toggle("err", isErr);
}

function currentSchema() {
  const text = schemaText(state.schema.tables);
  return { text, key: schemaKey(text) };
}

function ago(ts) {
  const d = (Date.now() - ts) / 1000;
  if (d < 60) return "just now";
  if (d < 3600) return `${Math.floor(d / 60)} min ago`;
  if (d < 86400) return `${Math.floor(d / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

// Light SQL highlighting: keywords only, on escaped text.
const KW = /\b(SELECT|FROM|WHERE|AND|OR|NOT|EXISTS|IN|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AS|GROUP BY|ORDER BY|HAVING|LIMIT|OFFSET|TOP|DISTINCT|COUNT|SUM|AVG|MIN|MAX|CASE|WHEN|THEN|ELSE|END|IS|NULL|UNION|ALL|EXCEPT|INTERSECT|WITH|INTERVAL|BETWEEN|LIKE|DESC|ASC|COALESCE|CURRENT_DATE|CURRENT_TIMESTAMP|NOW|DATE_SUB|DATEADD|DATE)\b/gi;
const highlight = (sql) => esc(sql).replace(KW, (m) => `<span class="kw">${m}</span>`);

/* ---------- Rendering ---------- */
function renderChips() {
  const list = suggestions(state.schema.tables);
  $("#askChips").innerHTML = list.map((q) => `<button type="button" class="chip">${esc(q)}</button>`).join("");
  $("#askChips").hidden = !list.length;
}

function renderHistory() {
  const list = state.queries;
  $("#askHistoryWrap").hidden = !list.length;
  $("#askHistory").innerHTML = list.map((x) => `<li class="${x.id === shownId ? "current" : ""}" data-id="${esc(x.id)}">
    <button type="button" class="hq" title="${esc(x.question)}">${esc(x.question)}</button>
    <button type="button" class="icon-btn hdel" aria-label="Remove “${esc(x.question)}” from history">×</button></li>`).join("");
}

function renderAnswer() {
  const x = state.queries.find((q) => q.id === shownId);
  if (!x) {
    answerEl.innerHTML = `<p class="empty">${state.schema.tables.length
      ? "Ask a question about your data. The answer uses only the tables and columns in your draft schema, and shows a Venn diagram when the question compares groups of rows."
      : "Add tables to the draft schema first (extract them from a sketch, or add them in the Editor). Questions are answered from that schema."}</p>`;
    return;
  }
  const a = x.answer, cs = getComputedStyle(document.documentElement);
  const colors = { accent: cs.getPropertyValue("--accent").trim(), ink: cs.getPropertyValue("--ink").trim() };
  const check = a.sql ? checkSql(a.sql, state.schema.tables) : { unknownTables: [], unknownColumns: [] };
  const unknown = [...check.unknownTables, ...check.unknownColumns];
  const stale = x.schemaKey !== currentSchema().key;
  const join = joinLabel(a.venn);
  let html = `<div class="ans-head">
      <p class="ans-q">${esc(x.question)}</p>
      <div class="ans-meta"><span>${DIALECTS[x.dialect]}</span><span>${esc(x.model)}</span><span>${ago(x.at)}</span>
        <button type="button" class="quiet" id="askAgain">${svgIcon("undo")}Ask again</button></div>
    </div>`;
  if (stale) html += `<p class="note-box">Your draft schema has changed since this was asked. Ask again for an answer that matches it.</p>`;
  if (a.missing.length) html += `<div class="note-box warn"><b>Not in your schema:</b><ul class="ans-list">${a.missing.map((m) => `<li>${esc(m)}</li>`).join("")}</ul></div>`;
  if (unknown.length) html += `<p class="note-box warn"><b>Check this query:</b> it uses names that aren't in your draft schema: <code>${unknown.map(esc).join("</code>, <code>")}</code>.</p>`;
  if (a.venn) {
    html += `<div class="venn-card">
      <div class="venn-fig">${vennSvg(a.venn, colors)}</div>
      <div class="venn-text">
        <b>${esc(join.title)}</b>
        <span class="venn-join">${esc(join.sql)}</span>
        <dl class="venn-sets">${a.venn.sets.map((s, i) => `<div><dt>${"ABC"[i]}</dt><dd>${esc(s.label)}${s.table ? ` <code>${esc(s.table)}</code>` : ""}</dd></div>`).join("")}</dl>
        <span class="hint">Shaded = the rows the query returns.</span>
      </div></div>`;
  }
  if (a.sql) {
    html += `<div class="sql-block">
      <div class="sql-head"><span class="eyebrow">SQL</span><span class="actions"><span class="copied" id="askCopied" role="status"></span><button type="button" id="askCopy">${svgIcon("copy")}Copy</button></span></div>
      <pre class="code" id="askSql" tabindex="0">${highlight(a.sql)}</pre></div>`;
  }
  if (a.explanation) html += `<p class="ans-expl">${esc(a.explanation)}</p>`;
  if (a.assumptions.length) html += `<div><span class="eyebrow">Assumed</span><ul class="ans-list">${a.assumptions.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></div>`;
  answerEl.innerHTML = html;
}

function renderAll() { renderChips(); renderHistory(); renderAnswer(); }

/* ---------- Asking ---------- */
async function ask({ force = false } = {}) {
  const q = input.value.trim();
  if (!q) { askMsg("Type a question first.", true); input.focus(); return; }
  if (!state.schema.tables.length) { askMsg("Add tables to the draft schema first. Answers are written from it.", true); return; }
  const dialect = dialectSel.value, schema = currentSchema();

  // Same question, same dialect, same schema: show the saved answer, no request.
  if (!force) {
    const hit = state.queries.find((x) => sameQuestion(x.question, q) && x.dialect === dialect && x.schemaKey === schema.key);
    if (hit) { shownId = hit.id; renderHistory(); renderAnswer(); askMsg("Shown from this project's history, so no request was used. Press Ask again for a fresh answer."); return; }
  }
  const { provider, key, model } = active();
  if (!key) { askMsg("Add your API key under AI connection first.", true); $("#apiKey").focus(); return; }

  ctl = new AbortController();
  $("#askBtn").disabled = true; $("#askStop").hidden = false;
  askMsg(`Writing the query with ${provider.name}…`);
  try {
    const prompt = askPrompt({ schema: schema.text, question: q, dialect, today: new Date().toLocaleDateString("en-CA") });
    const r = await provider.ask(key, prompt, { model, signal: ctl.signal, schema: ASK_SCHEMA });
    if (r.truncated) throw new Error("The answer was cut off. Try a narrower question, or pick a stronger model.");
    const answer = normalizeAnswer(parseJson(r.text || ""));
    if (!answer) throw new Error("The answer couldn't be read. Try again, or pick a stronger model.");
    const entry = { id: uid(), question: q, dialect, schemaKey: schema.key, model: r.model || model, at: Date.now(), answer };
    state.queries = [entry, ...state.queries.filter((x) => !(sameQuestion(x.question, q) && x.dialect === dialect))].slice(0, 30);
    shownId = entry.id;
    renderHistory(); renderAnswer(); askMsg("");
    emit("dirty");
  } catch (e) {
    askMsg(e?.name === "AbortError" ? "Stopped." : (e?.message || "Something went wrong. Try again."), e?.name !== "AbortError");
  } finally {
    ctl = null; $("#askBtn").disabled = false; $("#askStop").hidden = true;
  }
}

$("#askBtn").addEventListener("click", () => ask());
$("#askStop").addEventListener("click", () => ctl?.abort());
input.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); ask(); } });

$("#askChips").addEventListener("click", (e) => {
  const b = e.target.closest(".chip");
  if (b) { input.value = b.textContent; input.focus(); }
});

$("#askHistory").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const id = li.dataset.id;
  if (e.target.closest(".hdel")) {
    state.queries = state.queries.filter((x) => x.id !== id);
    if (shownId === id) shownId = null;
    renderHistory(); renderAnswer(); emit("dirty");
    return;
  }
  const x = state.queries.find((q) => q.id === id);
  if (!x) return;
  shownId = id; input.value = x.question; dialectSel.value = x.dialect;
  renderHistory(); renderAnswer(); askMsg("");
});

answerEl.addEventListener("click", (e) => {
  if (e.target.closest("#askAgain")) {
    const x = state.queries.find((q) => q.id === shownId);
    if (x) { input.value = x.question; dialectSel.value = x.dialect; }
    ask({ force: true });
  } else if (e.target.closest("#askCopy")) {
    const done = (m) => { const c = $("#askCopied"); if (c) { c.textContent = m; setTimeout(() => { c.textContent = ""; }, 2500); } };
    const text = state.queries.find((q) => q.id === shownId)?.answer.sql || "";
    const fallback = () => { const r = document.createRange(); r.selectNodeContents($("#askSql")); const s = getSelection(); s.removeAllRanges(); s.addRange(r); done("Selected. Press Ctrl+C or ⌘C to copy."); };
    try { navigator.clipboard.writeText(text).then(() => done("Copied"), fallback); } catch { fallback(); }
  }
});

on("project:loaded", () => { shownId = state.queries[0]?.id || null; askMsg(""); renderAll(); });
on("draft:replaced", renderAll);
on("draft:edited", () => { renderChips(); renderAnswer(); });
renderAll();
