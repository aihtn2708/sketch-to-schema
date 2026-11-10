// Import CSV: from "Add tables from CSV" (draft editor) or "Import CSV" (Sample data tab).
// Each file either loads rows into an existing table (columns matched by name; replace or add)
// or becomes a new table in the draft, with types, key and references guessed from the data and
// marked to check. The rows become that table's sample data. Nothing leaves the browser.
import { $, esc, uid } from "../util.js";
import { state, emit } from "../state.js";
import { tName, cName } from "../schema/export.js";
import { parseCsv, guessTable, matchColumns, tableNameFromFile } from "./csv.js";
import { lineUp, norm } from "./rows.js";
import { M, setup, ensureData, reconcile, remember, notice, entryFor } from "./sample.js";

const dlg = $("#csvDialog"), body = $("#csvBody");
const MAX_BYTES = 20 * 1024 * 1024;
let files = [];          // [{ fname, p (parsed), name, target: "new" | tableId, mode: "replace" | "append", skip }]
let origin = "data";     // "draft" or "data": where the import started, for the message afterwards

const plural = (n, w) => `${n.toLocaleString()} ${w}${n === 1 ? "" : "s"}`;
const SEP = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" };

// Tables a new table may point to: the draft's (with a single key) and the other new files.
function targets(except) {
  const out = [];
  for (const t of setup().tables) {
    const pks = t.columns.filter((c) => c.pk);
    if (pks.length === 1) out.push({ name: tName(t), pk: cName(pks[0]) });
  }
  for (const f of files) {
    if (f === except || f.skip || f.target !== "new") continue;
    const pk = guessTable(f.name, f.p.header, f.p.rows).columns.find((c) => c.pk);
    if (pk) out.push({ name: f.name, pk: pk.name });
  }
  return out;
}

function renderDialog() {
  const tables = setup().tables;
  body.innerHTML = files.map((f, i) => {
    const head = `<h3>${esc(f.fname)} <span class="hint">${f.skip ? "" : `${plural(f.p.rows.length, "row")} · ${plural(f.p.header.length, "column")} · ${SEP[f.p.delimiter] || "comma"} separated`}</span></h3>`;
    if (f.skip) return `<section class="csv-file">${head}<p class="note-box warn">${esc(f.skip)}</p></section>`;
    const warn = f.p.warnings.length ? `<p class="note-box warn">${f.p.warnings.map(esc).join("<br>")}</p>` : "";
    const opts = `<option value="new"${f.target === "new" ? " selected" : ""}>A new table</option>` +
      tables.map((t) => `<option value="${esc(t.id)}"${f.target === t.id ? " selected" : ""}>Existing table: ${esc(tName(t))}</option>`).join("");
    let detail;
    if (f.target === "new") {
      const g = guessTable(f.name, f.p.header, f.p.rows, targets(f));
      const notes = g.columns.filter((c) => c.notes.type).map((c) => `${c.name}: ${c.notes.type}`);
      detail = `<div class="csv-row"><label class="field"><span>Table name</span><input class="in in-name" data-i="${i}" data-f="name" value="${esc(f.name)}" spellcheck="false"></label></div>
        <p class="hint">Columns, with types guessed from the values (check them in the draft afterwards):</p>
        <ul class="csv-cols">${g.columns.map((c) => `<li class="${Object.keys(c.notes).length ? "guess" : ""}" title="${esc(Object.values(c.notes).join(" "))}">${c.pk ? `<span class="k">PK</span> ` : ""}${esc(c.name)} <span class="ty">${esc(c.type)}${c.references ? ` → ${esc(c.references)}` : ""}</span></li>`).join("")}</ul>
        ${notes.length ? `<ul class="ans-list">${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}`;
    } else {
      const t = tables.find((x) => x.id === f.target);
      const m = matchColumns(t.columns.map((c) => ({ name: cName(c) })), f.p.header);
      const got = t.columns.filter((_, j) => m.idx[j] >= 0).map(cName), empty = t.columns.filter((_, j) => m.idx[j] < 0).map(cName);
      detail = `<div class="csv-row"><label class="field"><span>Rows</span><select class="in" data-i="${i}" data-f="mode">
          <option value="replace"${f.mode === "replace" ? " selected" : ""}>Replace the table's rows</option>
          <option value="append"${f.mode === "append" ? " selected" : ""}>Add to the table's rows</option></select></label></div>
        <p class="hint">Columns matched by name: ${got.length ? esc(got.join(", ")) : "none"}.${empty.length ? ` Left empty (NULL): ${esc(empty.join(", "))}.` : ""}${m.unused.length ? ` Not used from the file: ${esc(m.unused.join(", "))}.` : ""}</p>
        ${got.length ? "" : `<p class="note-box warn">No column names match, so every row would be empty. Check the file's header row, or import it as a new table.</p>`}`;
    }
    const prev = f.p.rows.slice(0, 5);
    const preview = `<div class="csv-prev"><table class="res"><thead><tr>${f.p.header.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${
      prev.map((r) => `<tr>${r.map((v) => `<td>${v === null ? `<span class="null">NULL</span>` : esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    return `<section class="csv-file">${head}${warn}
      <div class="csv-row"><label class="field"><span>Load into</span><select class="in" data-i="${i}" data-f="target">${opts}</select></label></div>
      ${detail}${preview}</section>`;
  }).join("") + (M().mode === "sql" ? `<p class="note-box">The sample data currently uses your own SQL. Importing switches back to table editing (Undo in the panel brings your SQL back).</p>` : "");
  $("#csvGo").disabled = !files.some((f) => !f.skip);
}

body.addEventListener("change", (e) => {
  const el = e.target.closest("[data-i]");
  if (!el) return;
  const f = files[+el.dataset.i];
  if (el.dataset.f === "name") f.name = norm(el.value) || f.name;
  else f[el.dataset.f] = el.value;
  renderDialog();
});

/* ---------- Opening ---------- */
document.addEventListener("click", (e) => {
  const b = e.target.closest(".csv-import");
  if (!b) return;
  origin = b.closest("#draftPanel") ? "draft" : "data";
  $("#csvFile").click();
});

$("#csvFile").addEventListener("change", async (e) => {
  const list = [...e.target.files];
  e.target.value = "";
  if (!list.length) return;
  const tables = setup().tables;
  files = [];
  for (const file of list) {
    const f = { fname: file.name, name: tableNameFromFile(file.name), target: "new", mode: "replace", skip: "", p: { header: [], rows: [], warnings: [] } };
    if (file.size > MAX_BYTES) f.skip = `Larger than ${MAX_BYTES / 1024 / 1024} MB; skipped. Use a smaller sample of the data.`;
    else {
      f.p = parseCsv(await file.text());
      if (!f.p.header.length) f.skip = "The file is empty.";
    }
    const same = tables.find((t) => norm(tName(t)) === f.name);
    if (same) f.target = same.id;
    files.push(f);
  }
  renderDialog();
  dlg.showModal();
});

const close = () => dlg.close();
$("#csvClose").addEventListener("click", close);
$("#csvCancel").addEventListener("click", close);

/* ---------- Importing ---------- */
$("#csvGo").addEventListener("click", () => {
  const use = files.filter((f) => !f.skip);
  if (!use.length) return;
  remember();
  ensureData();
  if (M().mode === "sql") M().mode = "rows";
  const done = [], created = [];

  // New tables go into the draft first, so references between them can be resolved.
  for (const f of use.filter((x) => x.target === "new")) {
    let name = f.name, k = 2;
    while (state.schema.tables.some((t) => norm(tName(t)) === name)) name = `${f.name}_${k++}`;
    const g = guessTable(name, f.p.header, f.p.rows, targets(f));
    const t = {
      id: uid(), name, flags: [],
      columns: g.columns.map((c) => ({
        id: uid(), name: c.name, type: c.type, typeGuessed: true, pk: c.pk, nullable: c.pk ? false : c.nullable, unique: false,
        ref: null, refName: c.references,
        flags: [c.notes.type && { field: "type", note: c.notes.type }, c.notes.pk && { field: "pk", note: c.notes.pk },
          c.notes.references && { field: "references", note: c.notes.references }].filter(Boolean)
      }))
    };
    state.schema.tables.push(t);
    created.push({ t, rows: f.p.rows });
  }
  for (const { t } of created) for (const c of t.columns) {
    if (!c.refName) continue;
    const [tn, cn] = c.refName.split(".");
    const tt = state.schema.tables.find((x) => norm(tName(x)) === norm(tn));
    const cc = tt?.columns.find((x) => norm(cName(x)) === norm(cn));
    if (tt && cc) c.ref = { t: tt.id, c: cc.id };
  }
  if (created.length) { emit("draft:replaced"); emit("dirty"); }

  const s = setup();
  for (const { t, rows } of created) {
    M().tables[t.id] = { name: tName(t), cols: t.columns.map((c) => ({ id: c.id, name: cName(c) })), rows, source: "imported" };
    const n = t.columns.reduce((a, c) => a + c.flags.length, 0);
    done.push(`${tName(t)} (new table, ${plural(rows.length, "row")}${n ? `, ${n} guess${n === 1 ? "" : "es"} to check` : ""})`);
  }
  for (const f of use.filter((x) => x.target !== "new")) {
    const t = s.tables.find((x) => x.id === f.target);
    if (!t) continue;
    const m = matchColumns(t.columns.map((c) => ({ name: cName(c) })), f.p.header);
    const incoming = f.p.rows.map((r) => m.idx.map((j) => (j < 0 ? null : r[j])));
    const old = entryFor(t);
    const rows = f.mode === "append" && old ? [...lineUp(t, old), ...incoming] : incoming;
    M().tables[t.id] = { name: tName(t), cols: t.columns.map((c) => ({ id: c.id, name: cName(c) })), rows, source: "imported" };
    done.push(`${tName(t)} (${f.mode === "append" ? "added" : "replaced with"} ${plural(incoming.length, "row")})`);
  }
  // Fill in the other tables (generated ones follow the imported rows' keys) and save.
  reconcile(s);
  close();
  const text = `Imported ${done.join(", ")}.${M().tests.length ? " Tests may now fail." : ""}`;
  notice(text + (created.length ? " New tables are in the draft schema; Undo restores the sample data only." : ""), true);
  if (origin === "draft") $("#draftCsvMsg").textContent = text + (created.length ? " Check the guessed types and keys below." : "");
  const first = created[0]?.t.id || use.find((f) => f.target !== "new")?.target;
  if (first) emit("mock:select-table", first);
  emit("mock:data-tab");
});
