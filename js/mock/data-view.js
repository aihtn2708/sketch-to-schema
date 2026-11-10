// The Sample data tab of Test on mock data.
//   Table: one table at a time as an editable grid (100 rows a page). Cells are checked as you
//          type: type, NOT NULL, unique and references.
//   SQL:   the same data as INSERT statements. Typing there switches to your own SQL; the Table
//          view then shows the database's result, read-only, until "Use table editing".
import { $, esc, slug } from "../util.js";
import { state, on, emit } from "../state.js";
import { tName, cName } from "../schema/export.js";
import { colById } from "../schema/model.js";
import { pgType, typeNotes } from "./setup.js";
import { lineUp, checkTable, toCsv } from "./rows.js";
import { M, setup, dataSql, ensureData, reconcile, remember, changed, notice, engine, readTable, sqlToRows } from "./sample.js";
import { errText } from "./mock-panel.js";

const PAGE = 100;
const grid = $("#dtGrid"), dataEl = $("#mockData");
let view = "table";        // "table" | "sql"
let current = null;        // id of the table on show
let page = 0;
let checks = {};           // problems in the table on show: { "row:col": message }
let selfEdit = false;      // the change being announced came from typing here
let readOnly = null;       // SQL mode: { id, rows } read from the database

const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
const isOpen = () => !$("#mvData").hidden;

/* ---------- Rendering ---------- */
export function render() {
  const s = setup();
  if (M().mode === "rows") ensureData(s);
  const own = M().mode === "sql";
  $("#dvTable").setAttribute("aria-selected", String(view === "table"));
  $("#dvSql").setAttribute("aria-selected", String(view === "sql"));
  $("#dataTableView").hidden = view !== "table";
  $("#dataSqlView").hidden = view !== "sql";
  $("#dataMode").textContent = own ? "Using your own SQL" : "";
  renderNote(s);
  renderTypeNotes(s);
  if (view === "sql") renderSql(s); else renderTable(s);
}

function renderNote(s) {
  const warn = [];
  if (M().mode === "sql" && M().dataSchema && M().dataSchema !== s.key) warn.push("The draft schema changed after you started using your own SQL. Update the SQL to match, or press Use table editing.");
  const e = engine.phase === "error" ? engine.error : null;
  if (e && (e.label === "data" || e.label === "schema")) warn.push(errText(e) + (e.detail ? ` ${e.detail}` : ""));
  for (const w of engine.info?.warnings || []) warn.push(`Relationship ${w.label} isn't enforced: ${w.message}.`);
  const note = $("#dataNote");
  note.hidden = !warn.length;
  note.innerHTML = warn.map(esc).join("<br>");
}

function renderTypeNotes(s) {
  const notes = typeNotes(s.tables);
  $("#typeNotes").innerHTML = notes.length ? `<li class="lh">Types changed to run on PostgreSQL:</li>${notes.map((n) => `<li><code>${esc(n)}</code></li>`).join("")}` : "";
  $("#mockSetup").textContent = s.tables.length
    ? `${s.create}\n\n-- Then the sample data, then:\n${s.fks.map((f) => f.sql).join("\n") || "-- (no relationships)"}`
    : "-- No tables yet.";
}

function renderSql(s) {
  if (document.activeElement !== dataEl) dataEl.value = s.tables.length ? dataSql(s) : "";
  $("#sqlNote").innerHTML = M().mode === "sql"
    ? `Your own SQL loads the mock database. <button type="button" class="quiet sql-to-rows">Use table editing</button>`
    : "Written from the Table view. Type here to use your own SQL instead (any statements PostgreSQL accepts); the Table view then shows its result, read-only.";
}

function renderTable(s) {
  const sel = $("#dtTable");
  if (!s.tables.length) {
    sel.innerHTML = ""; sel.hidden = true; $("#dtActs").hidden = true; $("#dtSource").hidden = true;
    $("#dtOwnSql").hidden = true; $("#dtChecks").hidden = true; $("#dtPager").innerHTML = "";
    grid.innerHTML = `<p class="empty">No tables yet. Add tables to the draft schema, or use Add tables from CSV in the Sketch to schema tab.</p>`;
    return;
  }
  if (!s.tables.some((t) => t.id === current)) { current = s.tables[0].id; page = 0; }
  const own = M().mode === "sql";
  sel.hidden = false;
  sel.innerHTML = s.tables.map((t) => {
    const d = M().tables[t.id];
    return `<option value="${esc(t.id)}"${t.id === current ? " selected" : ""}>${esc(tName(t))}${!own && d ? ` · ${plural(d.rows.length, "row")}` : ""}</option>`;
  }).join("");
  $("#dtOwnSql").hidden = !own;
  $("#dtActs").hidden = false;
  $("#dtAddRow").hidden = own; $("#dtRegen").hidden = own;
  $("#dtHint").hidden = own;
  const t = s.tables.find((x) => x.id === current);
  if (own) return renderReadOnly(t);
  const d = M().tables[t.id];
  const src = $("#dtSource");
  src.hidden = false;
  src.className = `pill src-${d.source}`;
  src.textContent = { generated: "Generated", edited: "Edited", imported: "Imported" }[d.source];
  src.title = d.source === "generated" ? "New sample data replaces these rows" : "New sample data keeps these rows; Regenerate replaces them";
  renderGrid(s, t, d);
}

function renderGrid(s, t, d) {
  const rows = d.rows;
  checks = checkTable(t, rows, s.tables, M().tables);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  page = Math.min(page, pages - 1);
  const from = page * PAGE, slice = rows.slice(from, from + PAGE);
  // Suggestions for columns that point to another table: that table's values.
  const lists = t.columns.map((c, j) => {
    const hit = c.ref && colById(s.tables, c.ref.c);
    const pd = hit && M().tables[hit.t.id];
    if (!pd) return "";
    const pj = hit.t.columns.indexOf(hit.c);
    const vals = [...new Set(lineUp(hit.t, pd).map((r) => r[pj]).filter((v) => v !== null))].slice(0, 300);
    return `<datalist id="dl-${j}">${vals.map((v) => `<option value="${esc(v)}">`).join("")}</datalist>`;
  }).join("");
  const head = `<tr><th class="n">#</th>${t.columns.map((c) => {
    const hit = c.ref && colById(s.tables, c.ref.c);
    const tags = [c.pk ? `<span class="k">PK</span>` : "", hit ? `→ ${esc(tName(hit.t))}` : ""].filter(Boolean).join(" ");
    return `<th>${esc(cName(c))} ${tags}<span class="ty">${esc(pgType(c.type))}${!c.nullable && !c.pk ? " · not null" : ""}</span></th>`;
  }).join("")}<th class="x"></th></tr>`;
  const body = slice.length ? slice.map((row, i) => {
    const r = from + i;
    return `<tr><td class="n">${r + 1}</td>${row.map((v, j) => {
      const bad = checks[`${r}:${j}`];
      const c = t.columns[j];
      return `<td><input class="cell${bad ? " bad" : ""}" data-r="${r}" data-c="${j}" value="${esc(v ?? "")}" placeholder="NULL"${c.ref ? ` list="dl-${j}"` : ""}${bad ? ` title="${esc(bad)}"` : ""} aria-label="${esc(cName(c))}, row ${r + 1}" spellcheck="false" autocomplete="off"></td>`;
    }).join("")}<td class="x"><button type="button" class="icon-btn dt-del" data-r="${r}" aria-label="Delete row ${r + 1}">×</button></td></tr>`;
  }).join("") : `<tr><td class="n"></td><td colspan="${t.columns.length + 1}" class="ro hint">No rows. Press Add row, or Import CSV.</td></tr>`;
  grid.innerHTML = `${lists}<table class="dt"><thead>${head}</thead><tbody>${body}</tbody></table>`;
  renderPager(rows.length, pages);
  renderChecks();
}

function renderPager(total, pages) {
  $("#dtPager").innerHTML = total > PAGE
    ? `<span>Rows ${(page * PAGE + 1).toLocaleString()}–${Math.min(total, (page + 1) * PAGE).toLocaleString()} of ${total.toLocaleString()}</span>
       <button type="button" data-page="${page - 1}"${page ? "" : " disabled"} aria-label="Previous page">‹ Previous</button>
       <button type="button" data-page="${page + 1}"${page < pages - 1 ? "" : " disabled"} aria-label="Next page">Next ›</button>`
    : total ? `<span>${plural(total, "row")}</span>` : "";
}

function renderChecks() {
  const n = Object.keys(checks).length, box = $("#dtChecks");
  box.hidden = !n;
  box.innerHTML = n ? `<span>${plural(n, "cell")} to check: building the database may fail, or the relationship won't be enforced.</span><button type="button" id="dtNext">Show next</button>` : "";
}

async function renderReadOnly(t) {
  $("#dtSource").hidden = true; $("#dtChecks").hidden = true;
  if (readOnly?.id !== t.id) {
    grid.innerHTML = `<p class="hint">Running your SQL to show the result…</p>`;
    $("#dtPager").innerHTML = "";
    try { readOnly = { id: t.id, ...(await readTable(t)) }; }
    catch (e) { grid.innerHTML = `<div class="err-box"><b>${esc(errText(e))}</b>${e?.detail ? `<span>${esc(e.detail)}</span>` : ""}</div>`; return; }
  }
  const { rows, cols } = readOnly;
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  page = Math.min(page, pages - 1);
  const slice = rows.slice(page * PAGE, page * PAGE + PAGE);
  grid.innerHTML = `<table class="dt"><thead><tr><th class="n">#</th>${cols.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr></thead><tbody>${
    slice.map((row, i) => `<tr><td class="n">${page * PAGE + i + 1}</td>${row.map((v) => `<td class="ro">${v === null ? `<span class="null">NULL</span>` : esc(v)}</td>`).join("")}</tr>`).join("")
    || `<tr><td class="n"></td><td colspan="${cols.length}" class="ro hint">No rows.</td></tr>`}</tbody></table>`;
  renderPager(rows.length, pages);
}

// After typing in a cell: check the table again and update only the marks, so focus stays put.
function refreshMarks() {
  const s = setup(), t = s.tables.find((x) => x.id === current), d = M().tables[current];
  if (!t || !d) return;
  checks = checkTable(t, d.rows, s.tables, M().tables);
  grid.querySelectorAll(".cell").forEach((el) => {
    const bad = checks[`${el.dataset.r}:${el.dataset.c}`];
    el.classList.toggle("bad", !!bad);
    if (bad) el.title = bad; else el.removeAttribute("title");
  });
  renderChecks();
}

function edited(d) {
  if (d.source === "generated") {
    d.source = "edited";
    const src = $("#dtSource"); src.className = "pill src-edited"; src.textContent = "Edited";
  }
  selfEdit = true; changed(); selfEdit = false;
}

function focusCell(r, c) {
  const want = Math.floor(r / PAGE);
  if (want !== page) { page = want; render(); }
  const el = grid.querySelector(`.cell[data-r="${r}"][data-c="${c}"]`);
  el?.focus(); el?.select?.();
}

/* ---------- Events ---------- */
$("#dvTable").addEventListener("click", () => { view = "table"; render(); });
$("#dvSql").addEventListener("click", () => { view = "sql"; render(); });
$("#dtTable").addEventListener("change", (e) => { current = e.target.value; page = 0; render(); });
$("#dtPager").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-page]");
  if (b) { page = Number(b.dataset.page); render(); grid.scrollTop = 0; }
});

grid.addEventListener("input", (e) => {
  const el = e.target.closest(".cell");
  const d = M().tables[current];
  if (!el || !d) return;
  d.rows[+el.dataset.r][+el.dataset.c] = el.value === "" ? null : el.value;
  edited(d);
  refreshMarks();
});
// Enter / ↓ moves down, Shift+Enter / ↑ moves up, like a spreadsheet.
grid.addEventListener("keydown", (e) => {
  const el = e.target.closest(".cell");
  if (!el) return;
  const step = e.key === "Enter" ? (e.shiftKey ? -1 : 1) : e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
  if (!step) return;
  const r = +el.dataset.r + step, d = M().tables[current];
  if (r < 0 || !d || r >= d.rows.length) return;
  e.preventDefault();
  focusCell(r, +el.dataset.c);
});
grid.addEventListener("click", (e) => {
  const b = e.target.closest(".dt-del");
  const d = M().tables[current];
  if (!b || !d) return;
  d.rows.splice(+b.dataset.r, 1);
  edited(d); render();
});

$("#dtAddRow").addEventListener("click", () => {
  const s = setup(), t = s.tables.find((x) => x.id === current), d = M().tables[current];
  if (!t || !d) return;
  const row = t.columns.map(() => null);
  // A single whole-number key gets the next number.
  const pks = t.columns.filter((c) => c.pk);
  if (pks.length === 1 && /^(integer|bigint|smallint)$/.test(pgType(pks[0].type))) {
    const j = t.columns.indexOf(pks[0]);
    row[j] = String(d.rows.reduce((m, r) => Math.max(m, Number(r[j]) || 0), 0) + 1);
  }
  d.rows.push(row);
  edited(d);
  page = Math.floor((d.rows.length - 1) / PAGE);
  render();
  focusCell(d.rows.length - 1, Math.max(0, t.columns.findIndex((c) => !c.pk)));
});

$("#dtRegen").addEventListener("click", () => {
  const s = setup(), t = s.tables.find((x) => x.id === current);
  if (!t) return;
  remember();
  reconcile(s, { newSeed: true, regen: t.id });
  notice(`Regenerated ${tName(t)}: ${plural(M().tables[t.id].rows.length, "row")}.${M().tests.length ? " Tests may now fail." : ""}`, true);
  render();
});

$("#dtExport").addEventListener("click", async () => {
  const s = setup(), t = s.tables.find((x) => x.id === current);
  if (!t) return;
  let names = t.columns.map(cName), rows;
  if (M().mode === "sql") { const r = readOnly?.id === t.id ? readOnly : await readTable(t).catch(() => null); if (!r) return; rows = r.rows; }
  else rows = lineUp(t, M().tables[t.id]);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toCsv(names, rows)], { type: "text/csv" }));
  a.download = `${slug(tName(t))}.csv`;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$("#dtChecks").addEventListener("click", (e) => {
  if (!e.target.closest("#dtNext")) return;
  const keys = Object.keys(checks).map((k) => k.split(":").map(Number)).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const at = document.activeElement?.closest?.(".cell");
  const cur = at ? [+at.dataset.r, +at.dataset.c] : [-1, -1];
  const next = keys.find(([r, c]) => r > cur[0] || (r === cur[0] && c > cur[1])) || keys[0];
  if (next) focusCell(next[0], next[1]);
});

// Typing in the SQL view switches to your own SQL.
dataEl.addEventListener("input", () => {
  if (M().mode !== "sql") {
    remember();
    M().mode = "sql";
    M().dataSchema = setup().key;
    notice("You're now using your own SQL for the sample data. The Table view shows its result, read-only; Use table editing turns it back into editable rows.", true);
    $("#dataMode").textContent = "Using your own SQL";
    renderSql(setup());
  }
  M().data = dataEl.value;
  readOnly = null;
  selfEdit = true; changed(); selfEdit = false;
});

async function toRows() {
  notice("Reading your SQL's result into tables…");
  try {
    await sqlToRows();
    readOnly = null;
    notice("Your SQL's result is now table data you can edit. Undo goes back to your SQL.", true);
  } catch (e) { notice(`Couldn't read your SQL: ${errText(e)}`); }
  render();
}
$("#dtToRows").addEventListener("click", toRows);
$("#sqlNote").addEventListener("click", (e) => { if (e.target.closest(".sql-to-rows")) toRows(); });

// Let other parts (CSV import) bring a table forward.
on("mock:select-table", (id) => { current = id; page = 0; view = "table"; });

on("mock:data-tab", render);
on("mock:changed", () => { readOnly = null; if (!selfEdit && isOpen()) render(); });
on("mock:status", () => { if (isOpen()) renderNote(setup()); });
on("project:loaded", () => { current = null; page = 0; readOnly = null; view = "table"; });
