// The draft editor: tables, columns, flags to check, and the summary pills.
import { $, esc, uid } from "../util.js";
import { state, on, emit } from "../state.js";
import { FIELD_LABEL, refKey, findObj, colById, draftStats } from "./model.js";
import { svgIcon } from "../icons.js";

const tables = () => state.schema.tables;
const fl = (obj, field) => (obj.flags.some((f) => f.field === field) ? " is-flagged" : "");

function noteHtml(obj) {
  if (!obj.flags.length) return "";
  return `<div class="notes">${obj.flags.map((f) =>
    `<div class="note" data-flag="${esc(obj.id)}|${f.field}"><span class="nf">${FIELD_LABEL[f.field]}</span><span class="nt">${esc(f.note)}</span><button type="button" class="chip-ok" data-flag="${esc(obj.id)}|${f.field}">Looks right</button></div>`).join("")}</div>`;
}

function refOptions(c) {
  let html = `<option value="">No reference</option>`;
  for (const t of tables()) for (const c2 of t.columns) {
    if (c2.id === c.id) continue;
    const v = t.id + "." + c2.id;
    html += `<option value="${esc(v)}"${refKey(c) === v ? " selected" : ""}>→ ${esc(t.name || "untitled")}.${esc(c2.name || "untitled")}</option>`;
  }
  return html;
}

function colHtml(c) {
  return `<div class="col" data-c="${esc(c.id)}">
    <input class="in in-name${fl(c, "name")}" id="n-${esc(c.id)}" data-f="name" value="${esc(c.name)}" aria-label="Column name" spellcheck="false">
    <span class="type-wrap"><input class="in in-type${fl(c, "type")}${c.typeGuessed ? " guessed" : ""}" id="y-${esc(c.id)}" data-f="type" list="types" value="${esc(c.type)}" aria-label="Type" spellcheck="false">${c.typeGuessed ? `<span class="guess-tag">guess</span>` : ""}</span>
    <div class="toggles">
      <label class="tg${fl(c, "pk")}" title="Primary key"><input type="checkbox" id="k-${esc(c.id)}" data-f="pk"${c.pk ? " checked" : ""}>PK</label>
      <label class="tg" title="Allows null"><input type="checkbox" id="u-${esc(c.id)}" data-f="nullable"${c.nullable ? " checked" : ""}>NULL</label>
      <label class="tg" title="Unique"><input type="checkbox" id="q-${esc(c.id)}" data-f="unique"${c.unique ? " checked" : ""}>UNIQ</label>
    </div>
    <select class="in in-ref${fl(c, "references")}" id="r-${esc(c.id)}" data-f="references" aria-label="References">${refOptions(c)}</select>
    <button type="button" class="icon-btn del-col" aria-label="Remove column ${esc(c.name)}">×</button>
  </div>${noteHtml(c)}`;
}

const isCollapsed = (t) => !!state.editor.collapsed[t.id];
const flagCount = (t) => t.flags.length + t.columns.reduce((n, c) => n + c.flags.length, 0);

export function renderDraft() {
  const el = $("#tables");
  $("#editorTools").hidden = tables().length < 2;
  if (!tables().length) {
    el.innerHTML = `<div class="empty">No tables in the draft yet. Extract them from a sketch, or add a table by hand.</div>`;
  } else {
    el.innerHTML = tables().map((t) => {
      const shut = isCollapsed(t), n = flagCount(t);
      return `<div class="tbl${shut ? " collapsed" : ""}" data-t="${esc(t.id)}">
      <div class="tbl-head">
        <button type="button" class="icon-btn tbl-toggle" aria-expanded="${!shut}" aria-label="${shut ? "Expand" : "Collapse"} table ${esc(t.name || "untitled")}">${svgIcon("chevron")}</button>
        <input class="in in-tname${fl(t, "name")}" id="t-${esc(t.id)}" data-f="tname" value="${esc(t.name)}" aria-label="Table name" spellcheck="false">
        <span class="tbl-meta">${t.columns.length} column${t.columns.length === 1 ? "" : "s"}</span>
        ${n ? `<span class="pill check flag-count" title="Items to check in this table">${n} to check</span>` : ""}
        <button type="button" class="quiet del-table">Remove table</button>
        <span class="tbl-cols" title="${esc(t.columns.map((c) => c.name).join(", "))}">${t.columns.map((c) => esc(c.name || "untitled") + (c.pk ? " (PK)" : c.ref ? " →" : "")).join(", ") || "No columns"}</span>
      </div>
      ${noteHtml(t)}
      ${t.columns.length ? `<div class="col-head" aria-hidden="true"><span>Column</span><span>Type</span><span>Flags</span><span>References</span><span></span></div>` : ""}
      <div class="cols">${t.columns.map(colHtml).join("")}</div>
      <div class="tbl-foot"><button type="button" class="quiet add-col">+ Add column</button></div>
    </div>`;
    }).join("");
  }
  const w = $("#warnings");
  w.hidden = !state.schema.warnings.length;
  w.innerHTML = state.schema.warnings.map((x) => `<li>${esc(x)}</li>`).join("");
  updateSummary();
}

function refreshRefOptions() {
  document.querySelectorAll(".in-ref").forEach((sel) => {
    const hit = colById(tables(), sel.closest("[data-c]").dataset.c);
    if (hit) sel.innerHTML = refOptions(hit.c);
  });
}

function updateSummary() {
  const { flags, cols, keptPct } = draftStats(tables(), state.original);
  $("#summary").innerHTML =
    `<span class="pill">${tables().length} tables · ${cols} columns</span>` +
    (flags ? `<span class="pill check">${flags} to check</span>` : `<span class="pill ok">All checked</span>`) +
    (keptPct !== null ? `<span class="pill" title="Share of extracted fields still as the model drafted them">${keptPct}% kept as extracted</span>` : "");
}

// Remove a flag and its note without re-rendering (keeps focus in the field being typed in).
function clearFlag(obj, field, marked) {
  if (!obj || !obj.flags.some((f) => f.field === field)) return;
  obj.flags = obj.flags.filter((f) => f.field !== field);
  document.querySelectorAll(`.note[data-flag="${CSS.escape(obj.id + "|" + field)}"]`).forEach((n) => {
    const box = n.parentElement; n.remove(); if (box && !box.children.length) box.remove();
  });
  marked?.classList.remove("is-flagged");
}

const edited = () => { updateSummary(); emit("draft:edited"); emit("dirty"); };
const replaced = () => { emit("draft:replaced"); emit("dirty"); };

$("#tables").addEventListener("input", (e) => {
  const el = e.target, f = el.dataset.f;
  if (!f) return;
  const t = tables().find((x) => x.id === el.closest("[data-t]")?.dataset.t);
  if (!t) return;
  if (f === "tname") { t.name = el.value; clearFlag(t, "name", el); refreshRefOptions(); }
  else {
    const c = t.columns.find((x) => x.id === el.closest("[data-c]")?.dataset.c);
    if (!c) return;
    if (f === "name") { c.name = el.value; clearFlag(c, "name", el); refreshRefOptions(); }
    if (f === "type") {
      c.type = el.value; clearFlag(c, "type", el);
      if (c.typeGuessed) { c.typeGuessed = false; el.classList.remove("guessed"); el.parentElement.querySelector(".guess-tag")?.remove(); }
    }
    if (f === "pk") {
      c.pk = el.checked;
      if (c.pk) { c.nullable = false; const n = $("#u-" + c.id); if (n) n.checked = false; }
      clearFlag(c, "pk", el.closest(".tg"));
    }
    if (f === "nullable") c.nullable = el.checked;
    if (f === "unique") c.unique = el.checked;
    if (f === "references") {
      const [tid, cid] = el.value.split(".");
      c.ref = el.value ? { t: tid, c: cid } : null;
      clearFlag(c, "references", el);
    }
  }
  edited();
});

$("#tables").addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.classList.contains("chip-ok")) {
    const [id, field] = b.dataset.flag.split("|");
    const marked = field === "pk" ? $("#k-" + id)?.closest(".tg")
      : field === "name" ? ($("#n-" + id) || $("#t-" + id)) : field === "type" ? $("#y-" + id) : $("#r-" + id);
    clearFlag(findObj(tables(), id), field, marked);
    updateSummary(); emit("dirty");
    return;
  }
  const t = tables().find((x) => x.id === b.closest("[data-t]")?.dataset.t);
  if (!t) return;
  if (b.classList.contains("tbl-toggle")) { setCollapsed(t, !isCollapsed(t)); emit("dirty"); return; }
  if (b.classList.contains("del-col")) {
    const cid = b.closest("[data-c]").dataset.c;
    t.columns = t.columns.filter((c) => c.id !== cid);
    for (const tt of tables()) for (const c of tt.columns) if (c.ref?.c === cid) c.ref = null;
    replaced();
  } else if (b.classList.contains("add-col")) {
    const c = { id: uid(), name: "", type: "", typeGuessed: false, pk: false, nullable: true, unique: false, ref: null, flags: [] };
    t.columns.push(c); replaced(); $("#n-" + c.id)?.focus();
  } else if (b.classList.contains("del-table")) {
    const ids = new Set(t.columns.map((c) => c.id));
    state.schema.tables = tables().filter((x) => x.id !== t.id);
    for (const tt of tables()) for (const c of tt.columns) if (c.ref && ids.has(c.ref.c)) c.ref = null;
    replaced();
  }
});

// Collapse or expand one table without re-rendering the editor.
function setCollapsed(t, shut) {
  if (shut) state.editor.collapsed[t.id] = true; else delete state.editor.collapsed[t.id];
  const box = document.querySelector(`.tbl[data-t="${CSS.escape(t.id)}"]`);
  if (!box) return;
  box.classList.toggle("collapsed", shut);
  const btn = box.querySelector(".tbl-toggle");
  btn.setAttribute("aria-expanded", String(!shut));
  btn.setAttribute("aria-label", `${shut ? "Expand" : "Collapse"} table ${t.name || "untitled"}`);
  if (!shut) return;
  // Bring the collapsed summary up to date with edits made while the table was open.
  const n = flagCount(t);
  box.querySelector(".flag-count")?.remove();
  if (n) box.querySelector(".tbl-meta").insertAdjacentHTML("afterend", `<span class="pill check flag-count" title="Items to check in this table">${n} to check</span>`);
  box.querySelector(".tbl-meta").textContent = `${t.columns.length} column${t.columns.length === 1 ? "" : "s"}`;
  const cols = box.querySelector(".tbl-cols");
  cols.title = t.columns.map((c) => c.name).join(", ");
  cols.innerHTML = t.columns.map((c) => esc(c.name || "untitled") + (c.pk ? " (PK)" : c.ref ? " →" : "")).join(", ") || "No columns";
}
export function expandTable(id) {
  const t = tables().find((x) => x.id === id);
  if (t && isCollapsed(t)) { setCollapsed(t, false); emit("dirty"); }
}
$("#collapseAll").addEventListener("click", () => { for (const t of tables()) setCollapsed(t, true); emit("dirty"); });
$("#expandAll").addEventListener("click", () => { for (const t of tables()) setCollapsed(t, false); emit("dirty"); });

$("#addTable").addEventListener("click", () => {
  const t = { id: uid(), name: "", flags: [], columns: [{ id: uid(), name: "id", type: "integer", typeGuessed: false, pk: true, nullable: false, unique: false, ref: null, flags: [] }] };
  tables().push(t); replaced(); $("#t-" + t.id)?.focus();
});

on("draft:replaced", renderDraft);
